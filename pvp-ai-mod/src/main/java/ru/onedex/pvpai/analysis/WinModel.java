package ru.onedex.pvpai.analysis;

import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.math.MathHelper;

/**
 * Win-chance model.
 *
 * Idea: each fighter has an expected "time to kill" = enemy effective HP / own damage per second.
 * DPS is measured in the fight (real health changes), blended with a prior from gear and skill.
 * Effective HP = health + absorption + healing resources (gapples, totems, potions).
 * Skill (accuracy, aim, crits, hit trading, strafing, cooldown timing) adds a correction.
 * Short analyses are pulled toward 50% because they contain less evidence.
 */
public final class WinModel {
    private WinModel() {}

    public static class Result {
        public double p;
        public double confidence;
        public double dpsMe, dpsEnemy;
        public double ehpMe, ehpEnemy;
        public double ttkMe, ttkEnemy;
        public double skillMe, skillEnemy;
        public double accMe = -1, accEnemy = -1;
        public double aimMe = -1, aimEnemy = -1;
        public double critMe = -1, critEnemy = -1;
        public int hitsMe, hitsEnemy;
        public int comboMe, comboEnemy;
        public Gear.Reserve reserveMe;
        public double reserveEnemyHp;
        public double seconds;
        public boolean forecast;
        public boolean enemyHpHidden;
        public double healMe, healEnemy;
    }

    /** How much of the stocked healing a player really turns into HP during fights (0.2..0.75). */
    static double usage(SideStats s, Profile prof) {
        double used = 0;
        if (s != null) used += s.gapples + s.egapples * 2 + s.potions + s.totems;
        if (prof != null) used += Math.min(4, (prof.gapples + prof.potions + prof.totems) / 3.0);
        return 0.2 + 0.55 * Math.min(1.0, used / 3.0);
    }

    /** Diminishing returns: a huge stash can't all be used in one fight. */
    static double diminish(double hp) {
        return hp * 30.0 / (30.0 + hp);
    }

    /** Merged skill estimate, 0..1 (0.5 = average). */
    static double skill(SideStats s, Profile prof) {
        double sum = 0, w = 0;
        double v;
        // accuracy
        v = mix(s == null ? -1 : s.accuracy(), s == null ? 0 : s.swings, prof == null ? -1 : prof.accuracy(), prof == null ? 0 : prof.swings);
        if (v >= 0) { sum += 0.22 * clamp01((v - 0.25) / 0.55); w += 0.22; }
        // aim error in degrees
        v = mix(s == null ? -1 : s.aimError(), s == null ? 0 : s.aimSamples, prof == null ? -1 : prof.aimError(), prof == null ? 0 : prof.aimSamples);
        if (v >= 0) { sum += 0.22 * clamp01(1.0 - (v - 2.0) / 20.0); w += 0.22; }
        // crits
        v = mix(s == null ? -1 : s.critRate(), s == null ? 0 : s.meleeHits, prof == null ? -1 : prof.critRate(), prof == null ? 0 : prof.hits);
        if (v >= 0) { sum += 0.12 * clamp01(v / 0.5); w += 0.12; }
        // hit trading
        double tradeS = -1;
        int nS = 0;
        if (s != null) {
            nS = s.totalHits() + s.hitsTaken;
            if (nS >= 4) tradeS = s.totalHits() / (double) nS;
        }
        v = mix(tradeS, nS, prof == null ? -1 : prof.trade(), prof == null ? 0 : prof.hits + prof.hitsTaken);
        if (v >= 0) { sum += 0.24 * v; w += 0.24; }
        // strafing (blocks per tick sideways)
        v = mix(s == null ? -1 : s.strafe(), s == null ? 0 : s.strafeSamples, prof == null ? -1 : prof.strafe(), prof == null ? 0 : prof.strafeSamples);
        if (v >= 0) { sum += 0.10 * clamp01(v / 0.16); w += 0.10; }
        // cooldown timing (damage relative to a full-charge hit)
        v = mix(s == null ? -1 : s.charge(), s == null ? 0 : s.chargeSamples, prof == null ? -1 : prof.charge(), prof == null ? 0 : prof.chargeSamples);
        if (v >= 0) { sum += 0.10 * clamp01((v - 0.35) / 0.6); w += 0.10; }

        if (w <= 0) return 0.5;
        double raw = sum / w;
        // shrink toward average when little is known
        double evidence = Math.min(1.0, w / 0.6);
        return 0.5 + (raw - 0.5) * evidence;
    }

    /** Session value weighted fully, profile (history) weighted half. */
    private static double mix(double a, int na, double b, int nb) {
        if (a < 0 && b < 0) return -1;
        if (a < 0) return b;
        if (b < 0) return a;
        double wa = Math.max(1, na), wb = Math.max(1, nb) * 0.5;
        return (a * wa + b * wb) / (wa + wb);
    }

    public static Result compute(FightSession s, PlayerEntity me, PlayerEntity enemy, Profile myProf, Profile enProf,
                                 PlayerTracker enemyTracker, PlayerTracker meTracker) {
        Result r = new Result();
        r.forecast = s == null;
        double T = s == null ? 0 : Math.max(0.5, s.activeSeconds);
        r.seconds = T;

        // ---------- skill ----------
        r.skillMe = skill(s == null ? null : s.me, myProf);
        r.skillEnemy = skill(s == null ? null : s.enemy, enProf);

        // ---------- damage per hit ----------
        float enemyStrength = enemyTracker != null && enemyTracker.hasStrength() ? 3f : 0f;
        double expMe = enemy != null ? Gear.expectedMelee(me, enemy, 0) : (enemyTracker != null ? enemyTracker.lastExpectedTaken : 4);
        double expEn = enemy != null ? Gear.expectedMelee(enemy, me, enemyStrength) : (enemyTracker != null ? enemyTracker.lastExpectedDealt : 4);
        if (enemyTracker != null && enemy != null) {
            enemyTracker.lastExpectedTaken = (float) expMe;
            enemyTracker.lastExpectedDealt = (float) expEn;
        }
        double spdMe = Math.min(2.0, Gear.attackSpeed(me.getMainHandStack()));
        double spdEn = enemy != null ? Math.min(2.0, Gear.attackSpeed(enemy.getMainHandStack())) : 1.6;

        // ---------- dps: observed blended with prior ----------
        double priorMe = spdMe * (0.30 + 0.45 * r.skillMe) * expMe * 1.12;
        double priorEn = spdEn * (0.30 + 0.45 * r.skillEnemy) * expEn * 1.12;
        double obsMe = 0, obsEn = 0;
        if (s != null) {
            obsMe = s.me.damageDealt / T;
            obsEn = s.enemy.damageDealt / T;
        }
        double W = 10.0;
        r.dpsMe = (obsMe * T + priorMe * W) / (T + W);
        r.dpsEnemy = (obsEn * T + priorEn * W) / (T + W);

        // ---------- healing: regeneration, gapples, potions measured during the fight ----------
        double healPrior = 0.25; // natural regen, HP per second
        double healObsMe = s == null ? 0 : s.me.healed / T;
        double healObsEn = s == null ? 0 : s.enemy.healed / T;
        r.healMe = (healObsMe * T + healPrior * W) / (T + W);
        r.healEnemy = (healObsEn * T + healPrior * W) / (T + W);

        // ---------- effective HP ----------
        r.reserveMe = Gear.myReserve(me);
        double myHp = me.getHealth() + me.getAbsorptionAmount();
        double enHp;
        if (enemy != null) {
            enHp = enemy.getHealth() + enemy.getAbsorptionAmount();
            if (enemyTracker != null && enemyTracker.hpHidden()) {
                enHp = Math.max(4.0, 20.0 - (s == null ? 0 : Math.min(16.0, s.me.damageDealt * 0.25)));
                r.enemyHpHidden = true;
            }
        } else {
            enHp = 10;
        }
        double enReserve = estimateEnemyReserve(s, enemy, enemyTracker, enProf);
        r.reserveEnemyHp = enReserve;
        // resources only help if the player actually uses them: weight by observed usage
        double useMe = usage(s == null ? null : s.me, myProf);
        double useEn = usage(s == null ? null : s.enemy, enProf);
        r.ehpMe = myHp + diminish(r.reserveMe.hp() * useMe);
        r.ehpEnemy = enHp + diminish(enReserve * useEn);

        double netMe = r.dpsMe - 0.8 * r.healEnemy;
        double netEn = r.dpsEnemy - 0.8 * r.healMe;
        r.ttkMe = r.ehpEnemy / Math.max(0.08, netMe);
        r.ttkEnemy = r.ehpMe / Math.max(0.08, netEn);
        r.ttkMe = Math.min(r.ttkMe, 600);
        r.ttkEnemy = Math.min(r.ttkEnemy, 600);

        double logit = 1.5 * Math.log(r.ttkEnemy / r.ttkMe) + 2.2 * (r.skillMe - r.skillEnemy);
        double c = T / (T + 20.0);
        logit *= 0.45 + 0.55 * c;
        r.p = MathHelper.clamp(1.0 / (1.0 + Math.exp(-logit)), 0.03, 0.97);

        // ---------- confidence ----------
        int hits = 0;
        if (s != null) {
            hits = s.me.totalHits() + s.enemy.totalHits();
            r.accMe = s.me.accuracy();
            r.accEnemy = s.enemy.accuracy();
            r.aimMe = s.me.aimError();
            r.aimEnemy = s.enemy.aimError();
            r.critMe = s.me.critRate();
            r.critEnemy = s.enemy.critRate();
            r.hitsMe = s.me.totalHits();
            r.hitsEnemy = s.enemy.totalHits();
            r.comboMe = s.me.maxCombo;
            r.comboEnemy = s.enemy.maxCombo;
        }
        double know = enProf == null ? 0 : enProf.knowledge();
        double conf = 1.0 - Math.exp(-(T / 75.0 + hits / 45.0 + know * 0.35));
        if (r.enemyHpHidden) conf *= 0.8;
        r.confidence = MathHelper.clamp(conf, 0.05, 0.97);
        return r;
    }

    /** Enemy inventory is invisible, so estimate from gear, what they already used and what they hold. */
    static double estimateEnemyReserve(FightSession s, PlayerEntity enemy, PlayerTracker t, Profile prof) {
        double base = 0;
        if (enemy != null) {
            double q = Gear.armorQuality(enemy);
            base = 2 + q * 16; // players in better gear usually carry more supplies
        } else {
            base = 8;
        }
        double used = s == null ? 0 : s.enemy.healUsedHp();
        double evidence = 0.6 * Math.min(used, 60);
        if (t != null) {
            if (t.seenGapple) evidence += 4;
            if (t.seenTotem) evidence += 6;
        }
        double totemNow = enemy != null && enemy.getOffHandStack().isOf(net.minecraft.item.Items.TOTEM_OF_UNDYING) ? 10 : 0;
        // people who used a lot earlier in the fight have probably burned part of their stash
        double depletion = s == null ? 0 : Math.min(0.5, used / 120.0);
        return Math.min(90, (base + evidence) * (1.0 - depletion) + totemNow);
    }

    private static double clamp01(double v) {
        return v < 0 ? 0 : (v > 1 ? 1 : v);
    }
}
