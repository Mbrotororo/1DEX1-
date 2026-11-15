package ru.onedex.bot.bot;

import net.minecraft.item.ItemStack;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.slot.SlotActionType;
import ru.onedex.bot.BotClient;
import ru.onedex.bot.config.BotConfig;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Selling to the buyer: the sell command (/b) opens a menu; a sign in it (or an item whose name matches a
 * keyword) opens the list of goods; clicking an item there sells it. Every menu goes to the log.
 */
public final class Sell {
    private Sell() {}

    private static String label(ItemStack s) {
        String n = Ctl.itemName(s);
        try { n += " \"" + s.getName().getString() + "\""; } catch (Throwable ignored) { }
        return n;
    }

    private static ScreenHandler waitWindow(ScreenHandler old, int ticks) {
        for (int t = 0; t < ticks; t++) {
            Ctl.ticks(1);
            ScreenHandler h = Ctl.call(() -> Ctl.player().currentScreenHandler);
            if (h != Ctl.call(() -> Ctl.player().playerScreenHandler) && h != old) { Ctl.ticks(5); return h; }
        }
        return null;
    }

    private static int topSize(ScreenHandler h) {
        return Ctl.call(() -> Math.max(0, h.slots.size() - 36));
    }

    private static void dump(ScreenHandler h, String tag) {
        String s = Ctl.call(() -> {
            StringBuilder b = new StringBuilder();
            int n = Math.max(0, h.slots.size() - 36);
            for (int i = 0; i < n; i++) {
                ItemStack it = h.getSlot(i).getStack();
                if (!it.isEmpty()) b.append(i).append(':').append(label(it)).append('x').append(it.getCount()).append(", ");
            }
            return b.toString();
        });
        BotClient.LOGGER.info("[bot] меню {}: {}", tag, s);
    }

    /** Sells all of these items in the bag. Returns how many items were sold. */
    public static int sell(List<String> items) {
        int before = 0;
        for (String n : items) before += Ctl.count(n);
        if (before == 0) return 0;
        Bot.INSTANCE.stage("Сдаю скупщику");
        Ctl.command(BotConfig.get().sellCommand);
        ScreenHandler h = waitWindow(null, 60);
        if (h == null) { BotClient.LOGGER.info("[bot] меню скупщика не открылось"); return 0; }
        dump(h, "скупщик");
        // a sign or an entry that leads to the list of goods
        List<String> keys = new ArrayList<>(BotConfig.get().sellMenuKeywords);
        int entry = Ctl.call(() -> {
            int n = Math.max(0, h.slots.size() - 36);
            for (int i = 0; i < n; i++) {
                ItemStack it = h.getSlot(i).getStack();
                if (it.isEmpty()) continue;
                String l = label(it).toLowerCase(Locale.ROOT);
                if (l.contains("sign")) return i;
                for (String k : keys) if (l.contains(k.toLowerCase(Locale.ROOT))) return i;
            }
            return -1;
        });
        boolean hasGoods = Ctl.call(() -> {
            int n = Math.max(0, h.slots.size() - 36);
            for (int i = 0; i < n; i++) if (items.contains(Ctl.itemName(h.getSlot(i).getStack()))) return true;
            return false;
        });
        ScreenHandler goods = h;
        if (entry >= 0 && !hasGoods) {
            Ctl.run(() -> Ctl.mc().interactionManager.clickSlot(h.syncId, entry, 0, SlotActionType.PICKUP, Ctl.player()));
            ScreenHandler h2 = waitWindow(h, 40);
            if (h2 != null) goods = h2;
            Ctl.ticks(5);
            dump(goods, "товары");
        }
        final ScreenHandler g = goods;
        for (String item : items) {
            for (int tries = 0; tries < 80 && Ctl.count(item) > 0; tries++) {
                if (Chests.leaveForFight()) break;
                int slot = Ctl.call(() -> {
                    int n = Math.max(0, g.slots.size() - 36);
                    for (int i = 0; i < n; i++) if (Ctl.itemName(g.getSlot(i).getStack()).equals(item)) return i;
                    return -1;
                });
                if (slot < 0) break;
                int c0 = Ctl.count(item);
                Ctl.run(() -> Ctl.mc().interactionManager.clickSlot(g.syncId, slot, 0, SlotActionType.PICKUP, Ctl.player()));
                Ctl.ticks(6);
                if (Ctl.count(item) >= c0) {
                    // maybe a shift-click sells everything
                    Ctl.run(() -> Ctl.mc().interactionManager.clickSlot(g.syncId, slot, 0, SlotActionType.QUICK_MOVE, Ctl.player()));
                    Ctl.ticks(6);
                    if (Ctl.count(item) >= c0) break;
                }
            }
        }
        Chests.close();
        int after = 0;
        for (String n : items) after += Ctl.count(n);
        int sold = before - after;
        BotClient.LOGGER.info("[bot] продано {}", sold);
        return sold;
    }
}
