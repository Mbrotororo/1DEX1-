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

    public static MinecraftClient mc() { return MinecraftClient.getInstance(); }

    // ------------------------------------------------------------------ thread bridge
    public static void check() {
        if (!Bot.INSTANCE.running()) throw new Stopped();
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

    /** A read done right on the bot thread (the game may change things meanwhile, a retry fixes that). */
    public static <T> T direct(Supplier<T> f) {
        check();
        for (int i = 0; ; i++) {
            try { return f.get(); } catch (RuntimeException e) { if (i >= 2) return call(f); }
        }
    }

    /** Waits n game ticks (20 per second). */
    public static void ticks(int n) {
        long target = Bot.INSTANCE.tickCount() + Math.max(1, n);
        while (Bot.INSTANCE.tickCount() < target) {
            check();
            try { Thread.sleep(10); } catch (InterruptedException e) { throw new Stopped(); }
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
            ItemStack off = inv.getStack(40);
            if (itemName(off).equals(item)) n += off.getCount();
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

    /** Puts an item matching `test` into the hand (moves it to the hotbar if needed). The best one first. */
    public static boolean hold(Predicate<String> test, Comparator<ItemStack> prefer) {
        return call(() -> {
            ClientPlayerEntity p = player();
            var inv = p.getInventory();
            int best = -1;
            for (int i = 0; i < 36; i++) {
                ItemStack s = inv.getStack(i);
                if (s.isEmpty() || !test.test(itemName(s))) continue;
                if (best < 0 || (prefer != null && prefer.compare(s, inv.getStack(best)) > 0)) best = i;
            }
            if (best < 0) return false;
            if (best < 9) { inv.setSelectedSlot(best); return true; }
            int hb = inv.getSelectedSlot();
            mc().interactionManager.clickSlot(p.playerScreenHandler.syncId, handlerSlot(best), hb, SlotActionType.SWAP, p);
            return true;
        });
    }

    public static boolean hold(String item) { return hold(n -> n.equals(item), null); }

    /** The best tool for a block in the hand (by mining speed), or nothing special. */
    public static void holdBestFor(BlockPos pos) {
        run(() -> {
            ClientPlayerEntity p = player();
            BlockState st = world().getBlockState(pos);
            var inv = p.getInventory();
            int best = -1;
            float bestSpeed = 1.0f;
            for (int i = 0; i < 36; i++) {
                ItemStack s = inv.getStack(i);
                if (s.isEmpty()) continue;
                float sp = s.getMiningSpeedMultiplier(st);
                if (sp > bestSpeed) { bestSpeed = sp; best = i; }
            }
            if (best < 0) return;
            if (best < 9) inv.setSelectedSlot(best);
            else mc().interactionManager.clickSlot(p.playerScreenHandler.syncId, handlerSlot(best), inv.getSelectedSlot(), SlotActionType.SWAP, p);
        });
    }

    /** Throws away all items with these names. */
    public static void toss(Predicate<String> test) {
        run(() -> {
            ClientPlayerEntity p = player();
            var inv = p.getInventory();
            for (int i = 0; i < 36; i++) {
                ItemStack s = inv.getStack(i);
                if (!s.isEmpty() && test.test(itemName(s))) {
                    mc().interactionManager.clickSlot(p.playerScreenHandler.syncId, handlerSlot(i), 1, SlotActionType.THROW, p);
                }
            }
        });
    }

    // ------------------------------------------------------------------ looking and walking
    public static void lookAt(Vec3d target) {
        Vec3d eye = player().getEyePos();
        double dx = target.x - eye.x, dy = target.y - eye.y, dz = target.z - eye.z;
        float yaw = (float) (MathHelper.atan2(dz, dx) * 180 / Math.PI) - 90f;
        float pitch = (float) -(MathHelper.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * 180 / Math.PI);
        Move.look(yaw, pitch);
        for (int i = 0; i < 8; i++) {
            float cy = player().getYaw(), cp = player().getPitch();
            if (Math.abs(MathHelper.wrapDegrees(yaw - cy)) < 3 && Math.abs(pitch - cp) < 3) break;
            ticks(1);
        }
    }

    /** Walks straight to the middle of a cell (on the same level). Sneaking keeps it from falling off edges. */
    public static boolean stepTo(BlockPos cell, boolean sneak) {
        Bot.INSTANCE.act("шаг " + cell.toShortString());
        Move.sneak(sneak);
        Move.walkTo(Vec3d.ofBottomCenter(cell), 0.2);
        int t = 0;
        while (Move.walking() && t++ < 100) ticks(1);
        Move.stopWalking();
        Move.sneak(false);
        ticks(1);
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
    public static boolean mine(BlockPos p) {
        if (world().getBlockState(p).isAir()) return false;
        if (reach(p) > 5.0) return false;
        Bot.INSTANCE.act("копаю " + p.toShortString());
        holdBestFor(p);
        lookAt(Vec3d.ofCenter(p));
        Vec3d eye = player().getEyePos();
        Direction face = Direction.getFacing(eye.x - (p.getX() + 0.5), eye.y - (p.getY() + 0.5), eye.z - (p.getZ() + 0.5));
        boolean instant = call(() -> {
            mc().interactionManager.attackBlock(p, face);
            player().swingHand(Hand.MAIN_HAND);
            return world().getBlockState(p).isAir();
        });
        if (instant) { ticks(2); return world().getBlockState(p).isAir(); }
        for (int t = 0; t < 200; t++) {
            ticks(1);
            boolean gone = call(() -> {
                if (world().getBlockState(p).isAir()) return true;
                mc().interactionManager.updateBlockBreakingProgress(p, face);
                player().swingHand(Hand.MAIN_HAND);
                return false;
            });
            if (gone) {
                ticks(2);
                return world().getBlockState(p).isAir();   // a protected block comes back
            }
        }
        run(() -> mc().interactionManager.cancelBlockBreaking());
        return false;
    }

    /** Puts an item (block, torch, seed) at `target`, clicking on the side of `ref`. */
    public static boolean place(BlockPos target, String item, BlockPos ref) {
        Bot.INSTANCE.act("ставлю " + item);
        if (!hold(item)) return false;
        String before = name(target);   // direct read
        Direction face = Direction.fromVector(target.getX() - ref.getX(), target.getY() - ref.getY(), target.getZ() - ref.getZ(), null);
        if (face == null) return false;
        Vec3d hit = Vec3d.ofCenter(ref).add(face.getOffsetX() * 0.5, face.getOffsetY() * 0.5, face.getOffsetZ() * 0.5);
        lookAt(hit);
        run(() -> {
            mc().interactionManager.interactBlock(player(), Hand.MAIN_HAND, new BlockHitResult(hit, face, ref, false));
            player().swingHand(Hand.MAIN_HAND);
        });
        for (int t = 0; t < 6; t++) {
            ticks(1);
            if (!name(target).equals(before)) return true;
        }
        return false;
    }

    /** Puts a block on any solid neighbour of `target`. */
    public static boolean placeAny(BlockPos target, String item) {
        if (solid(target)) return true;
        for (Direction d : new Direction[]{Direction.DOWN, Direction.NORTH, Direction.SOUTH, Direction.EAST, Direction.WEST, Direction.UP}) {
            BlockPos ref = target.offset(d);
            if (solid(ref) && place(target, item, ref)) return true;
        }
        return false;
    }

    /** Uses (right-clicks) a block: picks berries, opens chests. */
    public static void use(BlockPos p) {
        lookAt(Vec3d.ofCenter(p));
        Direction face = call(() -> {
            Vec3d eye = player().getEyePos();
            return Direction.getFacing(eye.x - (p.getX() + 0.5), eye.y - (p.getY() + 0.5), eye.z - (p.getZ() + 0.5));
        });
        run(() -> {
            mc().interactionManager.interactBlock(player(), Hand.MAIN_HAND, new BlockHitResult(Vec3d.ofCenter(p), face, p, false));
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
        Move.look(call(() -> player().getYaw()), 90f);
        ticks(3);
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
        Vec3d before = pos();
        command(cmd);
        for (int t = 0; t < timeoutTicks; t++) {
            ticks(1);
            if (pos().distanceTo(before) > 6) {
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
