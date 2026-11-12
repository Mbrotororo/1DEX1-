package ru.onedex.pvpai;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.onedex.pvpai.analysis.Brain;
import ru.onedex.pvpai.config.ModConfig;
import ru.onedex.pvpai.gui.HudOverlay;
import ru.onedex.pvpai.gui.MenuScreen;

public class PvpAiClient implements ClientModInitializer {
    public static final String MOD_ID = "dexpvpai";
    public static final Logger LOGGER = LoggerFactory.getLogger("1DEX1 PvP AI");

    public static KeyBinding MENU_KEY;

    @Override
    public void onInitializeClient() {
        ModConfig.load();
        Brain.INSTANCE.load();

        KeyBinding.Category category = KeyBinding.Category.create(Identifier.of(MOD_ID, "main"));
        MENU_KEY = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.dexpvpai.menu", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_F8, category));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (MENU_KEY.wasPressed()) {
                if (client.currentScreen == null) client.setScreen(new MenuScreen());
            }
            try {
                Brain.INSTANCE.onTick(client);
            } catch (Throwable t) {
                LOGGER.error("PvP AI tick failed", t);
            }
        });

        HudElementRegistry.addLast(Identifier.of(MOD_ID, "fight_card"), HudOverlay::render);

        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> Brain.INSTANCE.save());
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
            Brain.INSTANCE.save();
            ModConfig.save();
        });
        LOGGER.info("1DEX1 PvP AI loaded — press F8");
    }
}
