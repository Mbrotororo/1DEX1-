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

    private static int clicks;

    /** A pause between two clicks, about as quick as a player shift-clicking (not every click the same). */
    private static void pause() { Ctl.ticks(2 + (clicks++ * 7 % 3)); }

    /** This window is still the one open (a click into a closed or replaced window goes nowhere). */
    private static boolean stillOpen(ScreenHandler h) {
        return Ctl.call(() -> Ctl.player().currentScreenHandler == h);
    }

    /**
     * Hit, or a monster close by: shut the window so the fight can happen (nothing fights with a chest open).
     * The caller just goes on with the next chest; the plan waits while the fight lasts.
     */
    static boolean leaveForFight() {
        if (!Ctl.call(() -> Bot.INSTANCE.danger())) return false;
        close();
        return true;
    }

    /** Puts matching items from the bag into the chest, leaving `keep` of each in the bag. Returns how many went in. */
    public static int deposit(GenericContainerScreenHandler h, Predicate<String> test, Map<String, Integer> keep) {
        int moved = 0;
        for (int pass = 0; pass < 2; pass++) {
            boolean any = false;
            for (int k = 0; k < 36; k++) {
                if (!stillOpen(h) || leaveForFight()) return moved;
                final int slotInBag = k;
                int done = Ctl.call(() -> {
                    ClientPlayerEntity p = Ctl.player();
                    int n = h.getRows() * 9;
                    int i = n + slotInBag;
                    ItemStack s = h.getSlot(i).getStack();
                    if (s.isEmpty()) return 0;
                    String name = Ctl.itemName(s);
                    if (!test.test(name)) return 0;
                    int have = 0;
                    for (int j = n; j < n + 36; j++) {
                        ItemStack o = h.getSlot(j).getStack();
                        if (!o.isEmpty() && Ctl.itemName(o).equals(name)) have += o.getCount();
                    }
                    int keepN = keep == null ? 0 : keep.getOrDefault(name, 0);
                    if (have - s.getCount() < keepN) return 0;   // this stack is part of what we keep
                    int c = s.getCount();
                    Ctl.mc().interactionManager.clickSlot(h.syncId, i, 0, SlotActionType.QUICK_MOVE, p);
                    return c;
                });
                if (done > 0) { moved += done; any = true; pause(); }
            }
            if (!any) break;
            Ctl.ticks(3);
        }
        return moved;
    }

    /** Takes matching items out of the chest, up to `want` in total (whole stacks). Returns how many came out. */
    public static int withdraw(GenericContainerScreenHandler h, Predicate<String> test, int want) {
        int got = 0;
        int n = Ctl.call(() -> h.getRows() * 9);
        for (int i = 0; i < n && got < want; i++) {
            if (!stillOpen(h) || leaveForFight()) break;
            final int slot = i;
            int c = Ctl.call(() -> {
                ItemStack s = h.getSlot(slot).getStack();
                if (s.isEmpty() || !test.test(Ctl.itemName(s))) return 0;
                // the bag must have room for it, or the click just does nothing
                if (Ctl.player().getInventory().getEmptySlot() < 0) return -1;
                int k = s.getCount();
                Ctl.mc().interactionManager.clickSlot(h.syncId, slot, 0, SlotActionType.QUICK_MOVE, Ctl.player());
                return k;
            });
            if (c < 0) break;
            if (c > 0) { got += c; pause(); }
        }
        return got;
    }
}
