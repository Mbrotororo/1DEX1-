package ru.onedex.newyear;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityFeatureRendererRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.client.render.entity.feature.FeatureRendererContext;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.render.entity.state.PlayerEntityRenderState;
import net.minecraft.client.util.InputUtil;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.onedex.newyear.config.NyConfig;
import ru.onedex.newyear.gui.NyMenuScreen;
import ru.onedex.newyear.render.SantaHatFeature;
import ru.onedex.newyear.snow.ScreenSnow;
import ru.onedex.newyear.snow.SnowSurfaces;
import ru.onedex.newyear.snow.WorldEffects;

public class NewYearClient implements ClientModInitializer {
    public static final String MOD_ID = "dexnewyear";
    public static final Logger LOGGER = LoggerFactory.getLogger("1DEX1 New Year");

    public static final boolean DEV = Boolean.getBoolean("dexnewyear.dev");
    public static KeyBinding MENU_KEY;

    @Override
    @SuppressWarnings({"unchecked", "rawtypes"})
    public void onInitializeClient() {
        NyConfig.load();
        WinterFilter.init();

        KeyBinding.Category category = KeyBinding.Category.create(Identifier.of(MOD_ID, "main"));
        MENU_KEY = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.dexnewyear.open_menu", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_F8, category));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (MENU_KEY.wasPressed()) {
                if (client.currentScreen == null) client.setScreen(new NyMenuScreen());
            }
            try {
                WorldEffects.tick(client);
                ru.onedex.newyear.snow.SnowCover.tick(client);
                WinterFilter.tick(client);
            } catch (Throwable t) {
                LOGGER.error("New Year tick failed", t);
            }
        });

        // big snow drifts on the ground (visual only)
        WorldRenderEvents.AFTER_ENTITIES.register(ctx -> {
            try {
                ru.onedex.newyear.snow.SnowCover.render(ctx);
            } catch (Throwable t) {
                LOGGER.error("Snow cover render failed", t);
            }
        });

        // Santa hats on every player model
        LivingEntityFeatureRendererRegistrationCallback.EVENT.register((type, renderer, helper, context) -> {
            if (renderer instanceof PlayerEntityRenderer<?> playerRenderer) {
                helper.register(new SantaHatFeature((FeatureRendererContext<PlayerEntityRenderState, PlayerEntityModel>) (FeatureRendererContext) playerRenderer));
            }
        });

        // winter filter under the HUD, screen snow on top of it
        HudElementRegistry.attachElementBefore(VanillaHudElements.MISC_OVERLAYS, Identifier.of(MOD_ID, "winter_filter"), WinterFilter::renderOverlay);
        HudElementRegistry.addLast(Identifier.of(MOD_ID, "screen_snow"), (ctx, counter) -> {
            MinecraftClient mc = MinecraftClient.getInstance();
            NyConfig c = NyConfig.INSTANCE;
            if (mc.currentScreen != null || mc.options.hudHidden || !c.screenSnow || !c.screenSnowInGame) return;
            SnowSurfaces.hud(mc, ctx.getScaledWindowWidth(), ctx.getScaledWindowHeight());
            ScreenSnow.render(ctx, false);
        });

        // every menu: snow on top, drifts on its buttons / windows
        ScreenEvents.AFTER_INIT.register((client, screen, w, h) -> {
            ScreenEvents.afterRender(screen).register((scr, ctx, mx, my, delta) -> {
                if (!NyConfig.INSTANCE.screenSnow) return;
                SnowSurfaces.screen(MinecraftClient.getInstance(), scr);
                ScreenSnow.render(ctx, true);
            });
            // snowballs / snowman / scattering with the mouse
            ScreenMouseEvents.allowMouseClick(screen).register((s, click) -> !ScreenSnow.onClick(click.x(), click.y(), click.button()));
            ScreenMouseEvents.allowMouseDrag(screen).register((s, click, dx, dy) -> !ScreenSnow.onDrag());
            ScreenMouseEvents.allowMouseRelease(screen).register((s, click) -> !ScreenSnow.onRelease());
        });

        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> NyConfig.save());
        LOGGER.info("1DEX1 New Year loaded — press F8");
    }
}
