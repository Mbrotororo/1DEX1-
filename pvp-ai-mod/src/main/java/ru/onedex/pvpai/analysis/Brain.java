package ru.onedex.pvpai.analysis;

import it.unimi.dsi.fastutil.ints.IntOpenHashSet;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.PotionContentsComponent;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.projectile.ProjectileEntity;
import net.minecraft.entity.projectile.thrown.EnderPearlEntity;
import net.minecraft.entity.projectile.thrown.PotionEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.math.Vec3d;
import ru.onedex.pvpai.config.ModConfig;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;

/** The analyzer: receives game events, keeps trackers, fight sessions and profiles. */
public final class Brain {
    public static final Brain INSTANCE = new Brain();

    public static final int GREEN = 0xFF3DDC84;
    public static final int YELLOW = 0xFFFFC93C;
    public static final int RED = 0xFFFF4D4D;

    public long tick;
    private static final boolean DEV = Boolean.getBoolean("dexpvpai.dev");

    private static void dev(String msg) {
        if (DEV) ru.onedex.pvpai.PvpAiClient.LOGGER.info("[dev] " + msg);
    }
    private ClientWorld lastWorld;
    private final Map<Integer, PlayerTracker> trackers = new HashMap<>();
    private final Map<UUID, FightSession> sessions = new HashMap<>();
    /** Last finished analysis for each enemy (kept after the fight ends). */
    private final Map<UUID, FightSession> lastDone = new HashMap<>();
    private final IntOpenHashSet seenProjectiles = new IntOpenHashSet();
    public ProfileStore store = new ProfileStore();
    private boolean dirty;
    private boolean meWasDead;

    private Brain() {}

    public static ModConfig cfg() {
        return ModConfig.INSTANCE;
    }

    public void load() {
        store = ProfileStore.load();
    }

    public void save() {
        if (dirty) store.save();
        dirty = false;
    }

    public void resetAll() {
        trackers.clear();
        sessions.clear();
        lastDone.clear();
        seenProjectiles.clear();
        store = new ProfileStore();
        store.save();
    }

    public int trackedPlayers() {
        return trackers.size();
    }

    public int knownProfiles() {
        return store.profiles.size();
    }

    // ------------------------------------------------------------------ tick

    public void onTick(MinecraftClient mc) {
        if (mc.world == null || mc.player == null) {
            if (lastWorld != null) {
                trackers.clear();
                seenProjectiles.clear();
                lastWorld = null;
                save();
            }
            return;
        }
        if (mc.world != lastWorld) {
            trackers.clear();
            seenProjectiles.clear();
            lastWorld = mc.world;
        }
        if (!cfg().pvpAiEnabled) return;
        tick++;

        for (AbstractClientPlayerEntity p : mc.world.getPlayers()) {
            PlayerTracker t = tracker(p);
            t.currentTick = tick;
            t.lastSeenTick = tick;
            updateHealth(t, p);
            updateItemUse(t, p);
            updateMovement(t, p);
            if (p.getOffHandStack().isOf(Items.TOTEM_OF_UNDYING) || p.getMainHandStack().isOf(Items.TOTEM_OF_UNDYING)) t.seenTotem = true;
            if (p.getMainHandStack().isOf(Items.GOLDEN_APPLE) || p.getMainHandStack().isOf(Items.ENCHANTED_GOLDEN_APPLE)
                    || p.getOffHandStack().isOf(Items.GOLDEN_APPLE)) t.seenGapple = true;
            FightSession s = sessions.get(p.getUuid());
            if (s != null) {
                s.enemyId = p.getId();
                s.enemyName = p.getGameProfile().name();
            }
        }
        trackers.values().removeIf(t -> tick - t.lastSeenTick > 200);

        scanProjectiles(mc.world);
        sampleCombat(mc);
        updateSessions(mc);
        detectMyDeath(mc);

        if (tick % 6000 == 0) save();
    }

    private PlayerTracker tracker(PlayerEntity p) {
        PlayerTracker t = trackers.get(p.getId());
        if (t == null || !t.uuid.equals(p.getUuid())) {
            t = new PlayerTracker(p.getId(), p.getUuid(), p.getGameProfile().name());
            trackers.put(p.getId(), t);
        }
        if (t.profile == null) t.profile = profile(p);
        return t;
    }

    /** Profile kept in memory only; it is written to the store once the player takes part in a fight. */
    private Profile profile(PlayerEntity p) {
        Profile pr = store.profiles.get(p.getUuid().toString());
        if (pr == null) pr = new Profile();
        pr.name = p.getGameProfile().name();
        pr.lastSeen = System.currentTimeMillis();
        return pr;
    }

    private void updateHealth(PlayerTracker t, PlayerEntity p) {
        float hp = p.getHealth();
        float abs = p.getAbsorptionAmount();
        if (Float.isNaN(hp)) return;
        if (!t.hpInit) {
            t.lastHp = hp;
            t.lastAbs = abs;
            t.hpInit = true;
            return;
        }
        if (Math.abs(hp - t.lastHp) > 0.01f) t.hpEverChanged = true;
        float delta = (t.lastHp + t.lastAbs) - (hp + abs);
        if (delta > 0.05f) {
            // several hits can land between two client ticks (lag / low FPS): split the health loss between them
            java.util.List<PlayerTracker.PendingHit> open = new java.util.ArrayList<>();
            float expSum = 0;
            for (PlayerTracker.PendingHit h : t.pendingOnMe) {
                if (h.amount < 0 && tick - h.tick <= 12) {
                    open.add(h);
                    expSum += Math.max(0.2f, h.expected * (h.crit ? 1.5f : 1f));
                }
            }
            for (PlayerTracker.PendingHit h : open) {
                float share = delta * Math.max(0.2f, h.expected * (h.crit ? 1.5f : 1f)) / expSum;
                h.amount = share;
                h.shared = open.size() > 1;
                credit(h, share, false);
            }
            t.pendingOnMe.removeIf(h -> h.amount >= 0);
        } else if (delta < -0.05f) {
            for (FightSession s : sessionsOf(t)) s.side(isMe(t)).healed += -delta;
        }
        // hits whose health change never arrived
        while (!t.pendingOnMe.isEmpty() && tick - t.pendingOnMe.peekFirst().tick > 12) {
            PlayerTracker.PendingHit h = t.pendingOnMe.pollFirst();
            if (h.amount < 0 && t.hpHidden()) {
                credit(h, h.expected * (h.crit ? 1.5f : 1f) * 0.85f, true);
            }
        }
        if (hp <= 0 && !t.dead) {
            t.dead = true;
            onPlayerDeath(p);
        } else if (hp > 0) {
            t.dead = false;
        }
        t.lastHp = hp;
        t.lastAbs = abs;
    }

    private void credit(PlayerTracker.PendingHit h, float amount, boolean estimated) {
        PlayerTracker atk = trackers.get(h.attackerId);
        double ratio = h.expected > 0 ? amount / (h.expected * (h.crit ? 1.5 : 1.0)) : -1;
        boolean ratioOk = !estimated && !h.shared && h.melee && ratio >= 0 && ratio < 1.8;
        if (atk != null && atk.profile != null && ratioOk) {
            atk.profile.chargeSum += Math.min(1.2, ratio);
            atk.profile.chargeSamples++;
        }
        dev("damage " + String.format("%.2f", amount) + " est=" + estimated + " crit=" + h.crit + " ratio=" + String.format("%.2f", ratio));
        if (h.session != null) {
            SideStats side = h.session.side(h.attackerIsMe);
            side.damageDealt += amount;
            if (estimated) side.damageEstimated = true;
            if (ratioOk) {
                side.chargeSum += Math.min(1.2, ratio);
                side.chargeSamples++;
            }
        }
        dirty = true;
    }

    private void updateItemUse(PlayerTracker t, PlayerEntity p) {
        boolean using = p.isUsingItem();
        if (using && !t.wasUsing) {
            t.usingStack = p.getActiveItem().copy();
            t.useStartTick = tick;
        }
        if (!using && t.wasUsing) {
            long dur = tick - t.useStartTick;
            ItemStack st = t.usingStack;
            int max = 32;
            try {
                max = st.getMaxUseTime(p);
            } catch (Exception ignored) {
            }
            if (max > 0 && max < 200 && dur >= max - 4) consumed(t, st);
        }
        t.wasUsing = using;
    }

    private void consumed(PlayerTracker t, ItemStack st) {
        Profile pr = t.profile;
        boolean me = isMe(t);
        if (st.isOf(Items.GOLDEN_APPLE)) {
            pr.gapples++;
            t.seenGapple = true;
            for (FightSession s : sessionsOf(t)) s.side(me).gapples++;
        } else if (st.isOf(Items.ENCHANTED_GOLDEN_APPLE)) {
            pr.gapples++;
            t.seenGapple = true;
            for (FightSession s : sessionsOf(t)) s.side(me).egapples++;
        } else if (st.isOf(Items.POTION)) {
            potionUsed(t, st, me);
        }
        dirty = true;
    }

    private void potionUsed(PlayerTracker t, ItemStack st, boolean me) {
        PotionContentsComponent pc = st.get(DataComponentTypes.POTION_CONTENTS);
        boolean heal = false;
        if (pc != null) {
            for (StatusEffectInstance e : pc.getEffects()) {
                if (e.getEffectType().equals(StatusEffects.STRENGTH)) {
                    t.strengthUntilTick = tick + Math.max(400, e.getDuration());
                }
                if (e.getEffectType().equals(StatusEffects.INSTANT_HEALTH) || e.getEffectType().equals(StatusEffects.REGENERATION)) {
                    heal = true;
                }
            }
        }
        t.profile.potions++;
        if (heal) for (FightSession s : sessionsOf(t)) s.side(me).potions++;
    }

    private void updateMovement(PlayerTracker t, PlayerEntity p) {
        if (!t.posInit) {
            t.lastX = p.getX();
            t.lastZ = p.getZ();
            t.posInit = true;
        }
    }

    private void scanProjectiles(ClientWorld world) {
        if (tick % 200 == 0) {
            IntOpenHashSet alive = new IntOpenHashSet();
            for (Entity e : world.getEntities()) alive.add(e.getId());
            seenProjectiles.retainAll(alive);
        }
        for (Entity e : world.getEntities()) {
            boolean pearl = e instanceof EnderPearlEntity;
            boolean potion = e instanceof PotionEntity;
            if (!pearl && !potion) continue;
            if (!seenProjectiles.add(e.getId())) continue;
            Entity owner = ((ProjectileEntity) e).getOwner();
            if (!(owner instanceof PlayerEntity op)) continue;
            PlayerTracker t = trackers.get(op.getId());
            if (t == null) continue;
            boolean me = isMe(t);
            if (pearl) {
                t.profile.pearls++;
                for (FightSession s : sessionsOf(t)) s.side(me).pearls++;
            } else {
                potionUsed(t, ((PotionEntity) e).getStack(), me);
            }
            dirty = true;
        }
    }

    private void sampleCombat(MinecraftClient mc) {
        ClientWorld world = mc.world;
        for (PlayerTracker a : trackers.values()) {
            Entity ea = world.getEntityById(a.entityId);
            if (!(ea instanceof PlayerEntity pa)) continue;
            double mx = pa.getX() - a.lastX, mz = pa.getZ() - a.lastZ;
            a.lastX = pa.getX();
            a.lastZ = pa.getZ();
            if (tick - a.lastTargetTick > 60) continue;
            Entity eb = world.getEntityById(a.lastTargetId);
            if (!(eb instanceof PlayerEntity pb) || pa.isDead() || pb.isDead()) continue;
            double dist = pa.distanceTo(pb);
            if (dist > 8) continue;

            FightSession s = null;
            boolean meSide = false;
            if (pa == mc.player) {
                s = sessions.get(pb.getUuid());
                meSide = true;
            } else if (pb == mc.player) {
                s = sessions.get(pa.getUuid());
            }
            SideStats side = s != null && !s.ended ? s.side(meSide) : null;

            if (dist <= 6) {
                Vec3d eye = pa.getEyePos();
                Vec3d look = pa.getRotationVec(1.0f);
                Vec3d to = pb.getBoundingBox().getCenter().subtract(eye);
                double len = to.length();
                if (len > 0.3) {
                    double cos = Math.max(-1, Math.min(1, look.dotProduct(to) / len));
                    double angle = Math.toDegrees(Math.acos(cos));
                    double half = Math.toDegrees(Math.atan2(0.45, len));
                    double err = Math.max(0, angle - half);
                    a.profile.aimErrSum += err;
                    a.profile.aimSamples++;
                    if (side != null) {
                        side.aimErrSum += err;
                        side.aimSamples++;
                    }
                }
            }
            double dx = pb.getX() - pa.getX(), dz = pb.getZ() - pa.getZ();
            double hl = Math.sqrt(dx * dx + dz * dz);
            if (hl > 0.1) {
                double lat = Math.abs(mx * (-dz / hl) + mz * (dx / hl));
                if (lat < 0.6) {
                    a.profile.strafeSum += lat;
                    a.profile.strafeSamples++;
                    if (side != null) {
                        side.strafeSum += lat;
                        side.strafeSamples++;
                    }
                }
            }
            if (side != null) {
                side.distSum += dist;
                side.distSamples++;
            }
        }
    }

    private void updateSessions(MinecraftClient mc) {
        PlayerEntity me = mc.player;
        int analysis = cfg().analysisSeconds;
        Iterator<FightSession> it = sessions.values().iterator();
        while (it.hasNext()) {
            FightSession s = it.next();
            PlayerEntity en = enemyEntity(mc, s);
            if (!s.ended) {
                boolean engaged = tick - s.lastExchangeTick <= 100 && en != null && en.distanceTo(me) <= 32;
                if (engaged) s.activeSeconds += 0.05;
                boolean refresh = tick % 10 == 0;
                if (refresh || (!s.done && s.activeSeconds >= analysis)) {
                    s.live = compute(s, mc, en);
                }
                if (refresh && tick % 100 == 0 && s.live != null) dev("session " + s.enemyName + " t=" + String.format("%.1f", s.activeSeconds) + " p=" + pct(s.live.p) + " dps=" + String.format("%.2f/%.2f", s.live.dpsMe, s.live.dpsEnemy) + " hits=" + s.me.totalHits() + "/" + s.enemy.totalHits() + " swings=" + s.me.swings + "/" + s.enemy.swings + " aim=" + degOrDash(s.me.aimError()) + "/" + degOrDash(s.enemy.aimError()) + " skill=" + String.format("%.2f/%.2f", s.live.skillMe, s.live.skillEnemy) + " ehp=" + String.format("%.1f/%.1f", s.live.ehpMe, s.live.ehpEnemy) + " heal=" + String.format("%.2f/%.2f", s.live.healMe, s.live.healEnemy) + " conf=" + pct(s.live.confidence));
                if (!s.done && s.activeSeconds >= analysis) {
                    dev("ANALYSIS DONE " + s.enemyName + " p=" + pct(s.live.p));
                    s.done = true;
                    s.result = s.live;
                } else if (s.done && refresh && en != null) {
                    s.result = s.live;
                }
                if (tick - s.lastExchangeTick > 2400) {
                    s.ended = true;
                    finalizePartial(mc, s);
                }
            }
            if (s.ended && tick - s.lastExchangeTick > 24000) it.remove();
        }
        lastDone.values().removeIf(s -> tick - s.lastExchangeTick > 24000);
    }

    private void finalizePartial(MinecraftClient mc, FightSession s) {
        if (!s.done && s.activeSeconds >= 10) {
            s.result = compute(s, mc, enemyEntity(mc, s));
            s.done = true;
            s.partial = true;
        }
    }

    private PlayerEntity enemyEntity(MinecraftClient mc, FightSession s) {
        Entity e = mc.world.getEntityById(s.enemyId);
        if (e instanceof PlayerEntity p && p.getUuid().equals(s.enemyUuid)) return p;
        return null;
    }

    private WinModel.Result compute(FightSession s, MinecraftClient mc, PlayerEntity en) {
        PlayerTracker et = en != null ? trackers.get(en.getId()) : null;
        PlayerTracker mt = trackers.get(mc.player.getId());
        Profile ep = store.profiles.get(s.enemyUuid.toString());
        Profile mp = mt != null ? mt.profile : null;
        return WinModel.compute(s, mc.player, en, mp, ep, et, mt);
    }

    private void detectMyDeath(MinecraftClient mc) {
        boolean dead = mc.player.isDead() || mc.player.getHealth() <= 0;
        if (dead && !meWasDead) onPlayerDeath(mc.player);
        meWasDead = dead;
    }

    private void onPlayerDeath(PlayerEntity p) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player == null) return;
        if (p == mc.player) {
            for (FightSession s : sessions.values()) {
                // only a death caused by this enemy counts (like vanilla kill credit)
                if (!s.ended && tick - s.lastEnemyHitTick <= 200) finishOutcome(mc, s, false);
            }
        } else {
            FightSession s = sessions.get(p.getUuid());
            if (s != null && !s.ended && tick - s.lastMyHitTick <= 200) finishOutcome(mc, s, true);
        }
    }

    private void finishOutcome(MinecraftClient mc, FightSession s, boolean win) {
        if (s.outcomeWin != null) return;
        if (!s.done && s.activeSeconds >= 8) {
            s.result = compute(s, mc, enemyEntity(mc, s));
            s.done = true;
            s.partial = true;
        }
        dev("outcome win=" + win + " vs " + s.enemyName);
        s.outcomeWin = win;
        s.ended = true;
        store.fights++;
        if (win) store.wins++;
        else store.losses++;
        Profile ep = store.profiles.get(s.enemyUuid.toString());
        if (ep != null) {
            ep.fightsWithMe++;
            if (win) ep.lossesVsMe++;
            else ep.winsVsMe++;
        }
        WinModel.Result r = s.result;
        if (r != null) {
            store.predictions++;
            if ((r.p >= 0.5) == win) store.correct++;
        }
        dirty = true;
        save();
    }

    // ------------------------------------------------------------------ events

    public void onSwing(LivingEntity e) {
        if (!cfg().pvpAiEnabled || !(e instanceof PlayerEntity p)) return;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.world == null || mc.player == null) return;
        PlayerTracker t = trackers.get(p.getId());
        if (t == null) return;
        PlayerEntity target = frontTarget(mc, p);
        if (target == null) return;
        t.profile.swings++;
        if (p == mc.player) {
            FightSession s = sessions.get(target.getUuid());
            if (s != null && !s.ended) s.me.swings++;
        } else if (target == mc.player) {
            FightSession s = sessions.get(p.getUuid());
            if (s != null && !s.ended) s.enemy.swings++;
        }
    }

    /** The player that {@code p} is most likely swinging at. */
    private PlayerEntity frontTarget(MinecraftClient mc, PlayerEntity p) {
        Vec3d eye = p.getEyePos();
        Vec3d look = p.getRotationVec(1.0f);
        PlayerEntity best = null;
        double bestScore = Double.MAX_VALUE;
        for (AbstractClientPlayerEntity o : mc.world.getPlayers()) {
            if (o == p || o.isSpectator() || o.isDead()) continue;
            Vec3d to = o.getBoundingBox().getCenter().subtract(eye);
            double len = to.length();
            if (len > 4.8 || len < 0.01) continue;
            double angle = Math.toDegrees(Math.acos(Math.max(-1, Math.min(1, look.dotProduct(to) / len))));
            if (angle > 45) continue;
            double score = angle + len * 4;
            if (score < bestScore) {
                bestScore = score;
                best = o;
            }
        }
        return best;
    }

    public void onDamage(int victimId, int causeId, int directId) {
        if (!cfg().pvpAiEnabled) return;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.world == null || mc.player == null || causeId < 0) return;
        Entity ve = mc.world.getEntityById(victimId);
        Entity ae = mc.world.getEntityById(causeId);
        if (!(ve instanceof PlayerEntity victim) || !(ae instanceof PlayerEntity attacker) || victim == attacker) return;
        PlayerTracker tv = tracker(victim);
        PlayerTracker ta = tracker(attacker);
        boolean melee = directId == causeId;
        float expected = melee ? Gear.expectedMelee(attacker, victim, attacker != mc.player && ta.hasStrength() ? 3f : 0f) : 3f;
        PlayerTracker.PendingHit h = new PlayerTracker.PendingHit(attacker.getId(), tick, melee, expected);

        // memory starts recording a player once damage is exchanged
        store.profiles.putIfAbsent(ta.uuid.toString(), ta.profile);
        store.profiles.putIfAbsent(tv.uuid.toString(), tv.profile);
        tv.hitsReceivedTotal++;
        ta.lastTargetId = victim.getId();
        ta.lastTargetTick = tick;
        tv.lastTargetId = attacker.getId();
        tv.lastTargetTick = tick;
        if (melee) ta.profile.hits++;
        tv.profile.hitsTaken++;

        if (attacker == mc.player || victim == mc.player) {
            PlayerEntity enemy = attacker == mc.player ? victim : attacker;
            FightSession s = sessions.get(enemy.getUuid());
            if (s == null || s.ended) {
                if (s != null && s.done) lastDone.put(s.enemyUuid, s);
                s = new FightSession(enemy.getUuid(), enemy.getId(), enemy.getGameProfile().name(), tick);
                sessions.put(enemy.getUuid(), s);
            }
            s.lastExchangeTick = tick;
            s.enemyId = enemy.getId();
            boolean mine = attacker == mc.player;
            if (mine) s.lastMyHitTick = tick;
            else s.lastEnemyHitTick = tick;
            SideStats atk = s.side(mine), def = s.side(!mine);
            if (melee) atk.meleeHits++;
            else atk.rangedHits++;
            def.hitsTaken++;
            atk.combo++;
            atk.maxCombo = Math.max(atk.maxCombo, atk.combo);
            def.combo = 0;
            h.session = s;
            h.attackerIsMe = mine;
        }
        dev("hit " + attacker.getGameProfile().name() + " -> " + victim.getGameProfile().name() + " melee=" + melee + " expected=" + String.format("%.2f", expected));
        tv.pendingOnMe.addLast(h);
        while (tv.pendingOnMe.size() > 16) tv.pendingOnMe.pollFirst();
        dirty = true;
    }

    public void onAnimation(int entityId, int anim) {
        if (!cfg().pvpAiEnabled || anim != 4) return; // 4 = critical hit
        PlayerTracker tv = trackers.get(entityId);
        if (tv == null) return;
        PlayerTracker.PendingHit h = null;
        for (Iterator<PlayerTracker.PendingHit> it = tv.pendingOnMe.descendingIterator(); it.hasNext(); ) {
            h = it.next();
            break;
        }
        if (h == null || h.crit || tick - h.tick > 2) return;
        h.crit = true;
        PlayerTracker ta = trackers.get(h.attackerId);
        if (ta != null) ta.profile.crits++;
        if (h.session != null) h.session.side(h.attackerIsMe).crits++;
    }

    public void onStatus(Entity e, byte status) {
        if (!cfg().pvpAiEnabled || !(e instanceof PlayerEntity p)) return;
        PlayerTracker t = trackers.get(p.getId());
        if (t == null) return;
        boolean me = isMe(t);
        switch (status) {
            case 35 -> { // totem
                t.profile.totems++;
                t.seenTotem = true;
                for (FightSession s : sessionsOf(t)) s.side(me).totems++;
                dirty = true;
            }
            case 29 -> { // shield block
                for (FightSession s : sessionsOf(t)) s.side(me).shieldBlocks++;
            }
            case 3 -> { // death
                if (!t.dead) {
                    t.dead = true;
                    onPlayerDeath(p);
                }
            }
            default -> {
            }
        }
    }

    // ------------------------------------------------------------------ queries

    private boolean isMe(PlayerTracker t) {
        MinecraftClient mc = MinecraftClient.getInstance();
        return mc.player != null && mc.player.getId() == t.entityId;
    }

    /** Active sessions where this tracker participates. */
    private Iterable<FightSession> sessionsOf(PlayerTracker t) {
        if (isMe(t)) {
            java.util.List<FightSession> l = new java.util.ArrayList<>();
            for (FightSession s : sessions.values()) if (!s.ended && tick - s.lastExchangeTick <= 400) l.add(s);
            return l;
        }
        FightSession s = sessions.get(t.uuid);
        return s != null && !s.ended ? java.util.List.of(s) : java.util.List.of();
    }

    /** The fight to show in HUD: most recent, still relevant. */
    public FightSession focus() {
        FightSession best = null;
        for (FightSession s : sessions.values()) {
            boolean relevant = (!s.ended && tick - s.lastExchangeTick <= 600) || (s.done && tick - s.lastExchangeTick <= 300);
            if (relevant && (best == null || s.lastExchangeTick > best.lastExchangeTick)) best = s;
        }
        return best;
    }

    public FightSession session(UUID uuid) {
        return sessions.get(uuid);
    }

    public WinModel.Result forecast(PlayerEntity p) {
        MinecraftClient mc = MinecraftClient.getInstance();
        PlayerTracker t = trackers.get(p.getId());
        if (t == null || mc.player == null) return null;
        if (t.forecast == null || tick - t.forecastTick >= 20) {
            PlayerTracker mt = trackers.get(mc.player.getId());
            t.forecast = WinModel.compute(null, mc.player, p, mt != null ? mt.profile : null, t.profile, t, mt);
            t.forecastTick = tick;
        }
        return t.forecast;
    }

    /** Text appended to a player's nametag (mode "над ником"). */
    public Text nametagSuffix(PlayerEntity p) {
        ModConfig c = cfg();
        if (!c.pvpAiEnabled || c.displayMode != 0) return null;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player == null || p == mc.player) return null;
        FightSession s = sessions.get(p.getUuid());
        if (s != null && s.done && s.result != null) {
            return badge(s.result.p, false);
        }
        if ((s == null || !s.done) && lastDone.containsKey(p.getUuid()) && (s == null || s.ended || s.activeSeconds < 1)) {
            FightSession old = lastDone.get(p.getUuid());
            if (tick - old.lastExchangeTick < 6000 && old.result != null) return badge(old.result.p, false);
        }
        if (s != null && !s.ended) {
            int left = (int) Math.ceil(Math.max(0, c.analysisSeconds - s.activeSeconds));
            return Text.literal("  анализ " + time(left)).withColor(0xFFB8BEC8);
        }
        if (c.forecastAll) {
            WinModel.Result r = forecast(p);
            if (r != null) return badge(r.p, true);
        }
        return null;
    }

    private static MutableText badge(double p, boolean forecast) {
        int col = color(p);
        return Text.literal("  " + (forecast ? "~" : "") + pct(p) + " ").withColor(col)
                .append(Text.literal("●").withColor(col));
    }

    public static int color(double p) {
        return p < 0.4 ? RED : (p <= 0.6 ? YELLOW : GREEN);
    }

    public static String pct(double p) {
        return Math.round(p * 100) + "%";
    }

    public static String time(int seconds) {
        return (seconds / 60) + ":" + String.format("%02d", seconds % 60);
    }

    public static String pctOrDash(double v) {
        return v < 0 ? "—" : Math.round(v * 100) + "%";
    }

    public static String degOrDash(double v) {
        return v < 0 ? "—" : String.format("%.1f°", v);
    }

}
