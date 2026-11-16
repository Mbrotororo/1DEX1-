package ru.onedex.bot;

import com.mojang.brigadier.arguments.StringArgumentType;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.onedex.bot.bot.Bot;
import ru.onedex.bot.config.BotConfig;
import ru.onedex.bot.farm.State;
import ru.onedex.bot.gui.BotMenuScreen;
import ru.onedex.bot.gui.Hud;

public class BotClient implements ClientModInitializer {
    public static final String MOD_ID = "dexbot";
    public static final Logger LOGGER = LoggerFactory.getLogger("1DEX1 Bot");
    public static KeyBinding MENU_KEY;
    private static boolean autoStarted;

    @Override
    public void onInitializeClient() {
        BotConfig.load();
        State.load();

        KeyBinding.Category category = KeyBinding.Category.create(Identifier.of(MOD_ID, "main"));
        MENU_KEY = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.dexbot.menu", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_F7, category));

        String autostart = System.getProperty("dexbot.autostart");
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (MENU_KEY.wasPressed()) {
                if (client.currentScreen == null) client.setScreen(new BotMenuScreen());
            }
            // started by itself a little after joining a server (test runs: in any world), once per joining
            if (client.world == null) autoStarted = false;
            else if (!autoStarted && client.player != null && client.player.age >= 200
                    && (autostart != null || (BotConfig.get().autoStart && client.getCurrentServerEntry() != null))) {
                autoStarted = true;
                if (!Bot.INSTANCE.running()) {
                    Bot.INSTANCE.start();
                    client.player.sendMessage(Text.literal("1DEX1 Bot запущен: фарм и продажа. F7 — меню и стоп"), false);
                }
            }
            try { Bot.INSTANCE.clientTick(client); } catch (Throwable t) { LOGGER.error("bot tick", t); }
        });

        HudElementRegistry.addLast(Identifier.of(MOD_ID, "status"), Hud::render);

        // chat control as well: /bot start, /bot stop, /bot reset
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, reg) -> dispatcher.register(
                ClientCommandManager.literal("bot")
                        .then(ClientCommandManager.literal("start").executes(c -> { Bot.INSTANCE.start(); return 1; }))
                        .then(ClientCommandManager.literal("stop").executes(c -> { Bot.INSTANCE.stop(); return 1; }))
                        .then(ClientCommandManager.literal("reset").executes(c -> {
                            Bot.INSTANCE.stop();
                            State.reset();
                            c.getSource().sendFeedback(Text.literal("1DEX1 Bot: прогресс сброшен"));
                            return 1;
                        }))
                        .then(ClientCommandManager.literal("stage").then(ClientCommandManager.argument("name", StringArgumentType.word()).executes(c -> {
                            State.get().phase = StringArgumentType.getString(c, "name");
                            State.save();
                            return 1;
                        })))));
        LOGGER.info("1DEX1 Bot loaded — F7");
    }
}
