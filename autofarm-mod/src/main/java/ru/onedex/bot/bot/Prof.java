package ru.onedex.bot.bot;

import ru.onedex.bot.BotClient;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A sampling profiler for testing (only with -Ddexbot.profile): every 20 ms it looks at what the bot thread is
 * doing (its three innermost frames of this mod) and once a minute logs where the time went.
 */
final class Prof {
    private Prof() {}

    static void start(Thread bot) {
        if (System.getProperty("dexbot.profile") == null) return;
        Thread p = new Thread(() -> {
            Map<String, Integer> hits = new HashMap<>();
            int n = 0;
            long next = System.currentTimeMillis() + 60_000;
            while (bot.isAlive()) {
                StringBuilder k = new StringBuilder();
                int c = 0;
                for (StackTraceElement e : bot.getStackTrace()) {
                    if (!e.getClassName().startsWith("ru.onedex.bot")) continue;
                    String cls = e.getClassName().substring(e.getClassName().lastIndexOf('.') + 1);
                    if (c > 0) k.append(" < ");
                    k.append(cls).append('.').append(e.getMethodName());
                    if (c == 0) k.append(':').append(e.getLineNumber());
                    if (++c == 3) break;
                }
                hits.merge(c == 0 ? "(idle)" : k.toString(), 1, Integer::sum);
                n++;
                if (System.currentTimeMillis() > next) {
                    List<Map.Entry<String, Integer>> l = new ArrayList<>(hits.entrySet());
                    l.sort((a, b) -> b.getValue() - a.getValue());
                    StringBuilder out = new StringBuilder("[prof] " + n + " samples");
                    for (int i = 0; i < Math.min(14, l.size()); i++)
                        out.append(String.format("%n  %4.1f%%  %s", 100.0 * l.get(i).getValue() / n, l.get(i).getKey()));
                    BotClient.LOGGER.info(out.toString());
                    hits.clear();
                    n = 0;
                    next = System.currentTimeMillis() + 60_000;
                }
                try { Thread.sleep(20); } catch (InterruptedException e) { return; }
            }
        }, "1DEX1 Prof");
        p.setDaemon(true);
        p.start();
    }
}
