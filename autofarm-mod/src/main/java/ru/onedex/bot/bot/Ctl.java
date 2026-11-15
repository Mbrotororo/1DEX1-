package ru.onedex.bot.bot;

import net.minecraft.block.BlockState;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.entity.ItemEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import ru.onedex.bot.BotClient;

import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;
import java.util.function.Supplier;

/**
 * Everything the bot thread can do with the game. The bot runs on its own thread so its plan can be
 * written as plain steps ("go there, dig this, put that"); every touch of the game happens on the game
 * thread through {@link #call}, and waiting is counted in game ticks.
 */
public final class Ctl {
    private Ctl() {}

    public static final class Stopped extends RuntimeException {
        public Stopped() { super("stopped", null, false, false); }
    }

    /** We were moved away while the plan waited (ran from a creeper, knocked off): the step starts over from here. */
    public static final class Moved extends RuntimeException {
        public Moved() { super("moved", null, false, false); }
    }

    public static MinecraftClient mc() { return MinecraftClient.getInstance(); }

    // ------------------------------------------------------------------ thread bridge
    public static void check() {
        if (!Bot.INSTANCE.running() || Thread.currentThread() != Bot.INSTANCE.thread()) throw new Stopped();
    }

    /** Runs on the game thread and waits for the result. */
    public static <T> T call(Supplier<T> f) {
        check();
        CompletableFuture<T> fut = new CompletableFuture<>();
        mc().execute(() -> {
            try { fut.complete(f.get()); } catch (Throwable t) { fut.completeExceptionally(t); }
        });
        try {
            return fut.get(5, TimeUnit.SECONDS);
        } catch (java.util.concurrent.TimeoutException e) {
            throw new RuntimeException("игра не ответила вовремя");
        } catch (InterruptedException e) {
            throw new Stopped();
        } catch (java.util.concurrent.ExecutionException e) {
            Throwable c = e.getCause();
            if (c instanceof RuntimeException r) throw r;
            throw new RuntimeException(c);
        }
    }

    public static void run(Runnable r) { call(() -> { r.run(); return null; }); }

    /**
     * Hands a change to the game thread without waiting for it. The game runs these in order, so whatever is
     * called after it (a click) happens after it.
     */
    public static void post(Runnable r) {
        check();
        mc().execute(r);
    }

    /** A read done right on the bot thread (the game may change things meanwhile, a retry fixes that). */
    public static <T> T direct(Supplier<T> f) {
        check();
        for (int i = 0; ; i++) {
            try { return f.get(); } catch (RuntimeException e) { if (i >= 2) return call(f); }
        }
    }

    /** Waits n game ticks (20 per second). Ticks spent fighting a monster do not count: the plan just pauses. */
    public static void ticks(int n) {
        int left = Math.max(1, n);
        long last = Bot.INSTANCE.tickCount();
        Vec3d before = null;
        while (left > 0 || Move.busy()) {
            check();
            if (before == null && Move.busy()) before = player().getEntityPos();
            try { Thread.sleep(10); } catch (InterruptedException e) { throw new Stopped(); }
            long now = Bot.INSTANCE.tickCount();
            if (now != last) {
                if (!Move.busy()) left -= (int) (now - last);
                last = now;
            }
        }
        // what we were doing was meant for the place we stood: after being moved away, plan it again
        if (before != null && player().getEntityPos().distanceTo(before) > 2.0) {
            run(() -> mc().interactionManager.cancelBlockBreaking());
            throw new Moved();
        }
    }

    public static void sleep(long ms) { ticks((int) Math.max(1, ms / 50)); }

    // ------------------------------------------------------------------ world
    public static ClientPlayerEntity player() { return mc().player; }
    public static ClientWorld world() { return mc().world; }

    // reads go straight from the bot thread (no waiting for a frame); actions go through the game thread
    public static Vec3d pos() { check(); return player().getEntityPos(); }
    public static BlockPos feet() { check(); return player().getBlockPos(); }
    public static BlockState state(BlockPos p) { return world().getBlockState(p); }
    public static String name(BlockPos p) { return blockName(world().getBlockState(p)); }

    public static String blockName(BlockState s) { return Registries.BLOCK.getId(s.getBlock()).getPath(); }
    public static String itemName(ItemStack s) { return s.isEmpty() ? "" : Registries.ITEM.getId(s.getItem()).getPath(); }

    /** A full block you can stand on (game thread). */
    public static boolean solidNow(BlockPos p) {
        BlockState s = world().getBlockState(p);
        return s.isFullCube(world(), p) || (!s.getCollisionShape(world(), p).isEmpty() && s.getCollisionShape(world(), p).getMax(Direction.Axis.Y) >= 1.0);
    }
    public static boolean solid(BlockPos p) { return solidNow(p); }
    public static boolean airNow(BlockPos p) {
        BlockState s = world().getBlockState(p);
        return s.isAir() || (s.getCollisionShape(world(), p).isEmpty() && !s.getFluidState().isStill() && !blockName(s).contains("bush") && !blockName(s).contains("bamboo"));
    }
    public static boolean loaded(BlockPos p) { return world().isChunkLoaded(p.getX() >> 4, p.getZ() >> 4); }

    // ------------------------------------------------------------------ inventory
    public static int count(String item) {
        return direct(() -> {
            int n = 0;
            var inv = player().getInventory();
            for (int i = 0; i < 36; i++) { ItemStack s = inv.getStack(i); if (itemName(s).equals(item)) n += s.getCount(); }
            return n;
        });
    }

    public static int countMatch(Predicate<String> test) {
        return direct(() -> {
            int n = 0;
            var inv = player().getInventory();
            for (int i = 0; i < 36; i++) { ItemStack s = inv.getStack(i); if (!s.isEmpty() && test.test(itemName(s))) n += s.getCount(); }
            return n;
        });
    }

    public static boolean has(Predicate<String> test) { return countMatch(test) > 0; }

    public static int freeSlots() {
        return direct(() -> {
            int n = 0;
            var inv = player().getInventory();
            for (int i = 0; i < 36; i++) if (inv.getStack(i).isEmpty()) n++;
            return n;
        });
    }

    /** Screen-handler slot id of an inventory slot (player's own inventory screen). */
    private static int handlerSlot(int invSlot) { return invSlot < 9 ? 36 + invSlot : invSlot; }

    /**
     * The hotbar slot a bag item is swapped into: the selected one, unless the sword is there (the sword stays
     * in the hotbar for fights, where no inventory clicks are made). Game thread.
     */
    /** When each hotbar slot was last put in the hand (game ticks): what was not needed for longest goes first. */
    private static final long[] slotUsed = new long[9];

    static void used(int slot) { if (slot >= 0 && slot < 9) slotUsed[slot] = Bot.INSTANCE.tickCount(); }

    /**
     * The hotbar slot a bag item is swapped into: an empty one, else the one used least recently (never the
     * sword). Building with dirt and stone then keeps both in the hotbar instead of swapping them in turn.
     */
    private static int swapTarget(net.minecraft.entity.player.PlayerInventory inv) {
        for (int i = 0; i < 9; i++) if (inv.getStack(i).isEmpty()) return i;
        int best = -1;
        for (int i = 0; i < 9; i++) {
            if (itemName(inv.getStack(i)).endsWith("_sword")) continue;
            if (best < 0 || slotUsed[i] < slotUsed[best]) best = i;
        }
        return best >= 0 ? best : inv.getSelectedSlot();
    }

    /**
     * After clicks in our own bag: the close a player's inventory screen sends when it is shut. Without it a
     * server-side check would think the inventory stays open while we walk and dig. Game thread.
     */
    private static void bagClosed(ClientPlayerEntity p) {
        p.networkHandler.sendPacket(new net.minecraft.network.packet.c2s.play.CloseHandledScreenC2SPacket(p.playerScreenHandler.syncId));
    }

    /**
     * Clicks in our own bag only standing still and not sneaking: no player clicks in the inventory while
     * walking or sneaking (anti-cheats look for exactly that). Releases sneak only where it is safe (the body
     * is over a block, not leaning over an edge). False if a click must not happen here now.
     */
    private static boolean readyForBag() {
        Move.stopWalking();
        ticks(2);   // the server has "no keys pressed" before anything else (flags go out with the next tick)
        for (int t = 0; t < 12; t++) {
            if (call(() -> player().getVelocity().horizontalLengthSquared() < 1e-5)) break;
            ticks(1);
        }
        if (Move.sneaking()) {
            boolean safe = call(() -> solidNow(BlockPos.ofFloored(player().getX(), player().getY() - 0.3, player().getZ())));
            if (!safe) return false;
            Move.sneak(false);
            ticks(2);   // the server has the release before the click
        }
        return true;
    }

    /** The sword into the hotbar (after the stash: shift-clicks may have put it in the bag). */
    public static void swordToHotbar() {
        closeScreen();
        boolean need = call(() -> {
            var inv = player().getInventory();
            boolean bag = false;
            for (int i = 0; i < 36; i++) if (itemName(inv.getStack(i)).endsWith("_sword")) { if (i < 9) return false; bag = true; }
            return bag;
        });
        if (!need || !readyForBag()) return;
        boolean moved = call(() -> {
            ClientPlayerEntity p = player();
            var inv = p.getInventory();
            int sword = -1;
            for (int i = 0; i < 36; i++) if (itemName(inv.getStack(i)).endsWith("_sword")) { sword = i; if (i < 9) return false; }
            if (sword < 0) return false;
            int t = -1;
            for (int i = 8; i >= 0 && t < 0; i--) if (inv.getStack(i).isEmpty()) t = i;
            if (t < 0) t = 8;
            mc().interactionManager.clickSlot(p.playerScreenHandler.syncId, handlerSlot(sword), t, SlotActionType.SWAP, p);
            bagClosed(p);
            return true;
        });
        if (moved) ticks(2);
    }

    /** Closes a chest or menu that is still open (inventory clicks of our own bag need it closed). */
    public static void closeScreen() {
        check();
        boolean open = player().currentScreenHandler != player().playerScreenHandler
                || mc().currentScreen instanceof net.minecraft.client.gui.screen.ingame.HandledScreen<?>;
        if (!open) return;
        run(() -> {
            ClientPlayerEntity p = player();
            if (p.currentScreenHandler != p.playerScreenHandler) p.closeHandledScreen();
            if (mc().currentScreen instanceof net.minecraft.client.gui.screen.ingame.HandledScreen<?>) mc().setScreen(null);
        });
        ticks(2);
    }

    /**
     * Puts an item matching `test` into the hand (moves it to the hotbar if needed). The best one first.
     * 0 = not there, 1 = it was already in the hotbar, 2 = it was moved there from the bag.
     */
    private static int take(Predicate<String> test, Comparator<ItemStack> prefer) {
        closeScreen();
        // read right here (no waiting for a frame); the hand is changed on the game thread only when needed
        int[] found = direct(() -> {
            var inv = player().getInventory();
            int b = -1;
            for (int i = 0; i < 36; i++) {
                ItemStack s = inv.getStack(i);
                if (s.isEmpty() || !test.test(itemName(s))) continue;
                // the one in the hand already wins a tie (no switching back and forth)
                if (b < 0 || (prefer != null && prefer.compare(s, inv.getStack(b)) > 0)
                        || (prefer == null && i == inv.getSelectedSlot() && b != i)) b = i;
            }
            return new int[]{b, inv.getSelectedSlot()};
        });
        int best = found[0];
        if (best < 0) return 0;
        if (best < 9) {
            if (found[1] != best) post(() -> player().getInventory().setSelectedSlot(best));
            used(best);
            return 1;
        }
        boolean sneak = Move.sneaking();
        if (!readyForBag()) return 0;
        call(() -> {
            ClientPlayerEntity p = player();
            var inv = p.getInventory();
            int hb = swapTarget(inv);
            inv.setSelectedSlot(hb);
            used(hb);
            mc().interactionManager.clickSlot(p.playerScreenHandler.syncId, handlerSlot(best), hb, SlotActionType.SWAP, p);
            bagClosed(p);
            return null;
        });
        if (sneak) Move.sneak(true);
        return 2;
    }

    public static boolean hold(Predicate<String> test, Comparator<ItemStack> prefer) {
        int r = take(test, prefer);
        if (r == 2) ticks(1);   // the swap reaches the server before the item is used
        return r > 0;
    }

    public static boolean hold(String item) { return hold(n -> n.equals(item), null); }

    /** The best tool for a block in the hand (by mining speed), or nothing special. True if the hand changed. */
    public static boolean holdBestFor(BlockPos pos) {
        closeScreen();
        int best = call(() -> {
            BlockState st = world().getBlockState(pos);
            var inv = player().getInventory();
            int b = -1;
            float bestSpeed = 1.0f;
            for (int i = 0; i < 36; i++) {
                ItemStack s = inv.getStack(i);
                if (s.isEmpty()) continue;
                float sp = s.getMiningSpeedMultiplier(st);
                if (sp > bestSpeed) { bestSpeed = sp; b = i; }
            }
            // a tool already in the hotbar: just select it
            if (b >= 0 && b < 9) used(b);
            if (b >= 0 && b < 9 && b != inv.getSelectedSlot()) { inv.setSelectedSlot(b); return 100 + b; }
            return b < 9 ? -1 : b;
        });
        if (best >= 100) return true;
        if (best < 0) return false;
        boolean sneak = Move.sneaking();
        if (!readyForBag()) return false;   // dig with what is in the hand
        call(() -> {
            ClientPlayerEntity p = player();
            var inv = p.getInventory();
            int hb = swapTarget(inv);
            inv.setSelectedSlot(hb);
            mc().interactionManager.clickSlot(p.playerScreenHandler.syncId, handlerSlot(best), hb, SlotActionType.SWAP, p);
            bagClosed(p);
            return null;
        });
        if (sneak) Move.sneak(true);
        return true;
    }

    /** Throws away whole stacks of items with these names, one by one like a player. Returns how many stacks. */
    public static int toss(Predicate<String> test) {
        closeScreen();
        int n = 0;
        boolean any = call(() -> {
            var inv = player().getInventory();
            for (int i = 0; i < 36; i++) { ItemStack s = inv.getStack(i); if (!s.isEmpty() && test.test(itemName(s))) return true; }
            return false;
        });
        if (!any || !readyForBag()) return 0;
        for (int i = 0; i < 36; i++) {
            final int slot = i;
            boolean thrown = call(() -> {
                ClientPlayerEntity p = player();
                ItemStack s = p.getInventory().getStack(slot);
                if (s.isEmpty() || !test.test(itemName(s))) return false;
                mc().interactionManager.clickSlot(p.playerScreenHandler.syncId, handlerSlot(slot), 1, SlotActionType.THROW, p);
                bagClosed(p);   // never a tick with the bag open
                return true;
            });
            if (thrown) { n++; ticks(2 + (i % 3)); }
        }
        return n;
    }

    /** Throws away stacks of one item until no more than `keep` (plus part of a stack) are left. */
    public static void tossExcess(String item, int keep) {
        closeScreen();
        boolean any = false;
        if (count(item) - 64 < keep || !readyForBag()) return;
        for (int i = 0; i < 36; i++) {
            final int slot = i;
            boolean thrown = call(() -> {
                ClientPlayerEntity p = player();
                var inv = p.getInventory();
                ItemStack s = inv.getStack(slot);
                if (!itemName(s).equals(item)) return false;
                int total = 0;
                for (int j = 0; j < 36; j++) if (itemName(inv.getStack(j)).equals(item)) total += inv.getStack(j).getCount();
                if (total - s.getCount() < keep) return false;
                mc().interactionManager.clickSlot(p.playerScreenHandler.syncId, handlerSlot(slot), 1, SlotActionType.THROW, p);
                bagClosed(p);
                return true;
            });
            if (thrown) ticks(2 + (i % 3));
        }
    }

    // ------------------------------------------------------------------ looking and walking
    public static void lookAt(Vec3d target) { lookAt(target, null); }

    /**
     * Turns the head to `target`. With `onTarget`: done as soon as the crosshair is where it has to be (a face
     * of a block is big: no need to crawl to its exact middle), held for one tick so the server has the look.
     */
    public static void lookAt(Vec3d target, BooleanSupplier onTarget) {
        Vec3d eye = player().getEyePos();
        double dx = target.x - eye.x, dy = target.y - eye.y, dz = target.z - eye.z;
        float yaw = (float) (MathHelper.atan2(dz, dx) * 180 / Math.PI) - 90f;
        float pitch = (float) -(MathHelper.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * 180 / Math.PI);
        Move.look(yaw, pitch);
        // the head turns smoothly frame by frame: wait until it is there (a bit more for a long turn)
        for (int i = 0; i < 30; i++) {
            float cy = player().getYaw(), cp = player().getPitch();
            if (Math.abs(MathHelper.wrapDegrees(yaw - cy)) < 1.5f && Math.abs(pitch - cp) < 1.5f) break;
            if (onTarget != null && direct(onTarget::getAsBoolean)) {
                ticks(1);   // the look goes out with this tick
                if (direct(onTarget::getAsBoolean)) break;
                continue;
            }
            ticks(1);
        }
    }

    /** The crosshair is on this face of this block now. */
    static boolean onFace(BlockPos ref, Direction face) {
        HitResult h = player().raycast(4.5, 1.0f, false);
        return h instanceof BlockHitResult b && b.getType() == HitResult.Type.BLOCK && b.getBlockPos().equals(ref)
                && (face == null || b.getSide() == face);
    }

    /** Walks straight to the middle of a cell (on the same level). Sneaking keeps it from falling off edges. */
    public static boolean stepTo(BlockPos cell, boolean sneak) { return stepTo(cell, sneak, false); }

    /**
     * With `roll`: no stop in the middle of the cell, the body rolls on into the next step (for walking past
     * plants while picking them; not where something is to be built from the cell).
     */
    public static boolean stepTo(BlockPos cell, boolean sneak, boolean roll) {
        Bot.INSTANCE.act("шаг " + cell.toShortString());
        if (!solid(cell.down())) return false;   // nothing to stand on there (a block the server took back)
        boolean wasSneaking = Move.sneaking();
        Move.sneak(sneak);
        Move.walkTo(Vec3d.ofBottomCenter(cell), roll && !sneak ? 0.35 : 0.2);
        int t = 0;
        while (Move.walking() && t++ < 100) ticks(1);
        Move.stopWalking();
        if (roll && !sneak && !wasSneaking) {
            Vec3d p = pos();
            return Math.abs(p.x - (cell.getX() + 0.5)) < 0.45 && Math.abs(p.z - (cell.getZ() + 0.5)) < 0.45 && Math.abs(p.y - cell.getY()) < 0.6;
        }
        // let the speed die down before the ledge guard goes, or the last bit of it carries us over the edge
        for (int i = 0; i < 4; i++) {
            if (direct(() -> player().getVelocity().horizontalLengthSquared() < 0.0004)) break;
            ticks(1);
        }
        Move.sneak(false);
        if (sneak || wasSneaking) ticks(1);   // the release goes out before the next move
        Vec3d p = pos();
        return Math.abs(p.x - (cell.getX() + 0.5)) < 0.35 && Math.abs(p.z - (cell.getZ() + 0.5)) < 0.35 && Math.abs(p.y - cell.getY()) < 0.6;
    }

    /** Walks to a block (within `range`) along a path over the ground. */
    public static boolean goTo(BlockPos goal, double range, int timeoutTicks) {
        Bot.INSTANCE.act("иду к " + goal.toShortString());
        long end = Bot.INSTANCE.tickCount() + timeoutTicks;
        for (int attempt = 0; attempt < 4 && Bot.INSTANCE.tickCount() < end; attempt++) {
            if (pos().distanceTo(Vec3d.ofCenter(goal)) <= range + 0.5) return true;
            List<BlockPos> path = direct(() -> Path.find(world(), player().getBlockPos(), goal, range, 12000));
            if (path == null || path.isEmpty()) { sleep(500); continue; }
            if (follow(path, end)) {
                if (pos().distanceTo(Vec3d.ofCenter(goal)) <= range + 1.0) return true;
            }
        }
        return pos().distanceTo(Vec3d.ofCenter(goal)) <= range + 1.0;
    }

    private static boolean follow(List<BlockPos> path, long endTick) {
        for (int i = 1; i < path.size(); i++) {
            BlockPos next = path.get(i);
            BlockPos cur = feet();
            boolean up = next.getY() > cur.getY();
            Move.walkTo(Vec3d.ofBottomCenter(next), 0.3);
            int t = 0;
            while (Move.walking() && t++ < 60) {
                if (Bot.INSTANCE.tickCount() > endTick) { Move.stopWalking(); return false; }
                boolean onGround = player().isOnGround();
                Move.jump(up && onGround);
                ticks(1);
                if (player().isTouchingWater()) Move.jump(true);
            }
            Move.jump(false);
            if (Move.walking()) { Move.stopWalking(); return false; }   // stuck: plan again
        }
        Move.stopWalking();
        return true;
    }

    // ------------------------------------------------------------------ blocks
    public static double reach(BlockPos p) {
        return player().getEyePos().distanceTo(Vec3d.ofCenter(p));
    }

    /** Breaks a block (with the best tool). True if it is gone. */
    /** Why the last mine() did not break its block (for the log). */
    public static volatile String lastMineFail = "";

    public static boolean mine(BlockPos p) {
        lastMineFail = "";
        if (world().getBlockState(p).isAir()) { lastMineFail = "уже воздух"; return false; }
        if (reach(p) > 5.0) { lastMineFail = "далеко " + String.format("%.1f", reach(p)); return false; }
        Bot.INSTANCE.act("копаю " + p.toShortString());
        if (holdBestFor(p)) ticks(1);   // the server has to know the tool before the first hit
        lookAt(Vec3d.ofCenter(p), () -> onFace(p, null));
        Vec3d eye = player().getEyePos();
        Direction face = Direction.getFacing(eye.x - (p.getX() + 0.5), eye.y - (p.getY() + 0.5), eye.z - (p.getZ() + 0.5));
        boolean instant = call(() -> {
            mc().interactionManager.attackBlock(p, face);
            player().swingHand(Hand.MAIN_HAND);
            return world().getBlockState(p).isAir();
        });
        if (instant) {
            ticks(2);
            if (!world().getBlockState(p).isAir()) { lastMineFail = "вернулся"; return false; }
            return true;
        }
        for (int t = 0; t < 400; t++) {
            ticks(1);
            boolean gone = call(() -> {
                if (world().getBlockState(p).isAir()) return true;
                mc().interactionManager.updateBlockBreakingProgress(p, face);
                player().swingHand(Hand.MAIN_HAND);
                return false;
            });
            if (gone) {
                ticks(2);
                if (!world().getBlockState(p).isAir()) { lastMineFail = "вернулся"; return false; }   // a protected block comes back
                return true;
            }
        }
        run(() -> mc().interactionManager.cancelBlockBreaking());
        lastMineFail = "не ломается";
        return false;
    }

    /** The middle of `face` of block `ref`. */
    static Vec3d faceCenter(BlockPos ref, Direction face) {
        return Vec3d.ofCenter(ref).add(face.getOffsetX() * 0.5, face.getOffsetY() * 0.5, face.getOffsetZ() * 0.5);
    }

    /** A player could click this face from here: the eye is in front of it and close enough. */
    public static boolean canSeeFace(BlockPos ref, Direction face) {
        Vec3d eye = player().getEyePos();
        Vec3d c = faceCenter(ref, face);
        double ahead = (eye.x - c.x) * face.getOffsetX() + (eye.y - c.y) * face.getOffsetY() + (eye.z - c.z) * face.getOffsetZ();
        return ahead > 0.05 && eye.distanceTo(c) <= 4.4;
    }

    /**
     * A point on `face` of `ref` that a straight look from the eye really reaches (nothing in front of it):
     * the middle first, then points nearer the edges. Null if none (game thread).
     */
    static Vec3d aimAt(BlockPos ref, Direction face) {
        Vec3d eye = player().getEyePos();
        Vec3d c = faceCenter(ref, face);
        // the two directions along the face
        Direction.Axis ax = face.getAxis();
        Vec3d u = ax == Direction.Axis.X ? new Vec3d(0, 0, 1) : new Vec3d(1, 0, 0);
        Vec3d v = ax == Direction.Axis.Y ? new Vec3d(0, 0, 1) : new Vec3d(0, 1, 0);
        double[] offs = {0, 0.3, -0.3};
        BlockPos firstHit = null;
        for (double a : offs) for (double b : offs) {
            Vec3d pt = c.add(u.multiply(a)).add(v.multiply(b));
            Vec3d end = pt.add(pt.subtract(eye).normalize().multiply(0.05));   // just past the face
            BlockHitResult h = world().raycast(new net.minecraft.world.RaycastContext(eye, end,
                    net.minecraft.world.RaycastContext.ShapeType.OUTLINE, net.minecraft.world.RaycastContext.FluidHandling.NONE, player()));
            if (h.getType() == HitResult.Type.BLOCK && h.getBlockPos().equals(ref) && h.getSide() == face) return pt;
            if (firstHit == null && h.getType() == HitResult.Type.BLOCK) firstHit = h.getBlockPos();
        }
        lastObstacle = firstHit;
        return null;
    }

    /** The block the crosshair was on after the last failed place() (something in the way), or null. */
    public static volatile BlockPos lastObstacle;

    /**
     * Puts an item (block, torch, seed) at `target` by clicking the face of `ref` that touches it, the way a
     * player does: only a face the eye can see, aimed at, with the click going where the crosshair really is.
     * With `verify`, waits a moment so a block the server takes back is not walked on.
     */
    /** Why the last place() did not put anything (for the log). */
    public static volatile String lastFail = "";

    public static boolean place(BlockPos target, String item, BlockPos ref, boolean verify) {
        lastObstacle = null;
        lastFail = "";
        Direction face = Direction.fromVector(target.getX() - ref.getX(), target.getY() - ref.getY(), target.getZ() - ref.getZ(), null);
        if (face == null) { lastFail = "не сосед"; return false; }
        if (!solid(ref)) { lastFail = "не к чему"; return false; }
        if (!canSeeFace(ref, face)) { lastFail = "грань не видна"; return false; }
        Bot.INSTANCE.act("ставлю " + item);
        if (!hold(item)) { lastFail = "не взял " + item; return false; }
        String before = name(target);   // direct read
        Vec3d aim = direct(() -> aimAt(ref, face));
        if (aim == null) { lastFail = "луч закрыт"; return false; }   // lastObstacle says what is in the way
        lookAt(aim, () -> onFace(ref, face));
        // the check and the click in one go on the game thread (where the crosshair really is right now)
        BlockHitResult hit = call(() -> {
            HitResult h = player().raycast(4.5, 1.0f, false);
            if (!(h instanceof BlockHitResult b) || b.getType() != HitResult.Type.BLOCK) { lastFail = "прицел мимо"; return null; }
            if (!b.getBlockPos().equals(ref) || b.getSide() != face) {
                lastObstacle = b.getBlockPos();
                lastFail = "прицел на " + b.getBlockPos().toShortString() + " " + b.getSide();
                return null;
            }
            mc().interactionManager.interactBlock(player(), Hand.MAIN_HAND, b);
            player().swingHand(Hand.MAIN_HAND);
            return b;
        });
        if (hit == null) return false;
        // the game shows a placed block at once (the server confirms it later): no wait then
        if (!verify && !name(target).equals(before)) return true;
        for (int t = 0; t < 6; t++) {
            ticks(1);
            if (!name(target).equals(before)) {
                if (!verify) return true;
                ticks(3);
                if (name(target).equals(before)) { lastFail = "сервер убрал"; return false; }
                return true;
            }
        }
        lastFail = "не появился";
        return false;
    }

    public static boolean place(BlockPos target, String item, BlockPos ref) { return place(target, item, ref, false); }

    /** Puts a block against any neighbour of `target` whose face we can see from here. */
    public static boolean placeAny(BlockPos target, String item) {
        if (solid(target)) return true;
        for (Direction d : new Direction[]{Direction.DOWN, Direction.NORTH, Direction.SOUTH, Direction.EAST, Direction.WEST, Direction.UP}) {
            BlockPos ref = target.offset(d);
            if (solid(ref) && canSeeFace(ref, d.getOpposite()) && place(target, item, ref)) return true;
        }
        return false;
    }

    /**
     * Sneaks to the edge of the block we stand on, toward `dir`, until the eye is past that side of it:
     * from there its side face can be clicked like a player bridging. Stays sneaking.
     */
    public static boolean edgeToward(BlockPos below, Direction dir) {
        Vec3d face = faceCenter(below, dir);
        Vec3d goal = Vec3d.ofBottomCenter(below.up()).add(dir.getOffsetX() * 1.2, 0, dir.getOffsetZ() * 1.2);
        // walking up to near the edge, sneaking only for the last bit (the sneak keeps the body on the block)
        Vec3d p0 = pos();
        double start = (p0.x - face.x) * dir.getOffsetX() + (p0.z - face.z) * dir.getOffsetZ();
        Move.sneak(start > -0.12);
        Move.walkTo(goal, 0.05);
        double over = 0;
        for (int t = 0; t < 40; t++) {
            ticks(1);
            Vec3d p = pos();
            over = (p.x - face.x) * dir.getOffsetX() + (p.z - face.z) * dir.getOffsetZ();
            if (over > -0.12) Move.sneak(true);   // a tick at walking speed later the body is still on the block
            if (over > 0.15) break;
        }
        Move.stopWalking();
        ticks(1);
        Vec3d p = pos();
        over = (p.x - face.x) * dir.getOffsetX() + (p.z - face.z) * dir.getOffsetZ();
        return over > 0.06;
    }

    /** Uses (right-clicks) a block: picks berries, opens chests. Clicks where the crosshair really is on it. */
    public static void use(BlockPos p) {
        lookAt(Vec3d.ofCenter(p), () -> onFace(p, null));
        BlockHitResult hit = call(() -> {
            HitResult h = player().raycast(4.5, 1.0f, false);
            if (h instanceof BlockHitResult b && b.getType() == HitResult.Type.BLOCK && b.getBlockPos().equals(p)) return b;
            // something small in the way: the side of the block that faces us, like the crosshair would give
            Vec3d eye = player().getEyePos();
            Direction face = Direction.getFacing(eye.x - (p.getX() + 0.5), eye.y - (p.getY() + 0.5), eye.z - (p.getZ() + 0.5));
            return new BlockHitResult(faceCenter(p, face), face, p, false);
        });
        run(() -> {
            mc().interactionManager.interactBlock(player(), Hand.MAIN_HAND, hit);
            player().swingHand(Hand.MAIN_HAND);
        });
    }

    /** Jumps and puts a block under itself: one block up. */
    public static boolean pillarUp(String item) {
        Bot.INSTANCE.act("столб вверх");
        if (!hold(item)) return false;
        // in the middle of the cell first: off centre the new block would touch our own body
        BlockPos cell = feet();
        stepTo(cell, true);
        int startY = feet().getY();
        BlockPos below = cell.down();
        lookAt(Vec3d.ofCenter(below).add(0, 0.5, 0));   // straight down at the block we stand on
        Move.jump(true);
        for (int t = 0; t < 20; t++) {
            ticks(1);
            if (pos().y >= startY + 1.15) break;
        }
        BlockPos target = cell;
        run(() -> {
            mc().interactionManager.interactBlock(player(), Hand.MAIN_HAND,
                    new BlockHitResult(Vec3d.ofCenter(below).add(0, 0.5, 0), Direction.UP, below, false));
            player().swingHand(Hand.MAIN_HAND);
        });
        Move.jump(false);
        ticks(8);
        return feet().getY() >= startY + 1 && solid(target);
    }

    /** Digs the block under the feet and drops one down. */
    public static boolean digDown() {
        BlockPos f = feet();
        int y0 = f.getY();
        if (!call(() -> airNow(f.down()))) {
            if (!mine(f.down())) return false;
        }
        for (int t = 0; t < 40 && feet().getY() >= y0; t++) ticks(1);
        ticks(4);
        return feet().getY() < y0;
    }

    // ------------------------------------------------------------------ chat, teleports
    public static void command(String cmd) {
        String c = cmd.startsWith("/") ? cmd.substring(1) : cmd;
        BotClient.LOGGER.info("[bot] /{}", c);
        run(() -> player().networkHandler.sendChatCommand(c));
    }

    /** Runs a teleport command and waits until we really moved. */
    public static boolean teleport(String cmd, int timeoutTicks) {
        Bot.INSTANCE.act(cmd);
        Move.stopWalking();          // servers cancel a /home warmup when you move
        Move.set(false, false, false);
        ticks(2);
        Vec3d before = pos();
        long tp = Bot.INSTANCE.teleports();
        command(cmd);
        for (int t = 0; t < timeoutTicks; t++) {
            ticks(1);
            // moved far, or the server put us somewhere (also onto the spot we already stand on)
            if (pos().distanceTo(before) > 6 || (t >= 2 && Bot.INSTANCE.teleports() != tp)) {
                ticks(30);   // let the chunks around arrive
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------ drops
    /** Walks over item drops nearby so they get picked up. */
    public static void collectDrops(double radius, int max) {
        for (int i = 0; i < max; i++) {
            Vec3d at = call(() -> {
                ClientPlayerEntity p = player();
                List<ItemEntity> items = world().getEntitiesByClass(ItemEntity.class, new Box(p.getBlockPos()).expand(radius), e -> true);
                return items.stream().min(Comparator.comparingDouble(e -> e.squaredDistanceTo(p))).map(ItemEntity::getEntityPos).orElse(null);
            });
            if (at == null) return;
            if (!goTo(BlockPos.ofFloored(at), 0.8, 120)) return;
            ticks(3);
        }
    }
}
