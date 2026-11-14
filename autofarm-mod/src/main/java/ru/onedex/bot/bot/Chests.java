package ru.onedex.bot.bot;

import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.screen.GenericContainerScreenHandler;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.util.math.BlockPos;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Predicate;

/** Opening chests and moving items in and out (shift-click, like a player). */
public final class Chests {
    private Chests() {}

    /** Opens the chest and waits for its window. Null if it did not open. */
    public static GenericContainerScreenHandler open(BlockPos chest) {
        if (Ctl.reach(chest) > 4.5 && !Ctl.goTo(chest, 3.0, 400)) return null;
        Bot.INSTANCE.act("сундук " + chest.toShortString());
        Ctl.use(chest);
        for (int t = 0; t < 40; t++) {
            Ctl.ticks(1);
            GenericContainerScreenHandler h = Ctl.call(() -> {
                ScreenHandler sh = Ctl.player().currentScreenHandler;
                return sh instanceof GenericContainerScreenHandler g ? g : null;
            });
            if (h != null) { Ctl.ticks(4); return h; }
        }
        return null;
    }

    public static void close() {
        Ctl.run(() -> {
            ClientPlayerEntity p = Ctl.player();
            if (p.currentScreenHandler != p.playerScreenHandler) p.closeHandledScreen();
            if (Ctl.mc().currentScreen instanceof HandledScreen<?>) Ctl.mc().setScreen(null);
        });
        Ctl.ticks(3);
    }

    /** What the open chest holds: item -> count. */
    public static Map<String, Integer> contents(GenericContainerScreenHandler h) {
        return Ctl.call(() -> {
            Map<String, Integer> m = new HashMap<>();
            int n = h.getRows() * 9;
            for (int i = 0; i < n; i++) {
                ItemStack s = h.getSlot(i).getStack();
                if (!s.isEmpty()) m.merge(Ctl.itemName(s), s.getCount(), Integer::sum);
            }
            return m;
        });
    }

    public static int freeSlots(GenericContainerScreenHandler h) {
        return Ctl.call(() -> {
            int n = h.getRows() * 9, free = 0;
            for (int i = 0; i < n; i++) if (h.getSlot(i).getStack().isEmpty()) free++;
            return free;
        });
    }

    /** Puts matching items from the bag into the chest, leaving `keep` of each in the bag. Returns how many went in. */
    public static int deposit(GenericContainerScreenHandler h, Predicate<String> test, Map<String, Integer> keep) {
        int moved = 0;
        for (int pass = 0; pass < 2; pass++) {
            int[] r = Ctl.call(() -> {
                ClientPlayerEntity p = Ctl.player();
                int n = h.getRows() * 9;
                Map<String, Integer> have = new HashMap<>();
                for (int i = n; i < n + 36; i++) {
                    ItemStack s = h.getSlot(i).getStack();
                    if (!s.isEmpty()) have.merge(Ctl.itemName(s), s.getCount(), Integer::sum);
                }
                int done = 0;
                for (int i = n; i < n + 36; i++) {
                    ItemStack s = h.getSlot(i).getStack();
                    if (s.isEmpty()) continue;
                    String name = Ctl.itemName(s);
                    if (!test.test(name)) continue;
                    int k = keep == null ? 0 : keep.getOrDefault(name, 0);
                    if (have.get(name) - s.getCount() < k) continue;   // this stack is part of what we keep
                    have.merge(name, -s.getCount(), Integer::sum);
                    done += s.getCount();
                    Ctl.mc().interactionManager.clickSlot(h.syncId, i, 0, SlotActionType.QUICK_MOVE, p);
                }
                return new int[]{done};
            });
            moved += r[0];
            Ctl.ticks(3);
        }
        return moved;
    }

    /** Takes matching items out of the chest, up to `want` in total (whole stacks). Returns how many came out. */
    public static int withdraw(GenericContainerScreenHandler h, Predicate<String> test, int want) {
        return Ctl.call(() -> {
            ClientPlayerEntity p = Ctl.player();
            int n = h.getRows() * 9, got = 0;
            for (int i = 0; i < n && got < want; i++) {
                ItemStack s = h.getSlot(i).getStack();
                if (s.isEmpty() || !test.test(Ctl.itemName(s))) continue;
                got += s.getCount();
                Ctl.mc().interactionManager.clickSlot(h.syncId, i, 0, SlotActionType.QUICK_MOVE, p);
            }
            return got;
        });
    }
}
