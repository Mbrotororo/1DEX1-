package ru.onedex.bot.mixin;

import net.minecraft.client.network.ClientPlayNetworkHandler;
import net.minecraft.network.packet.s2c.play.PlayerPositionLookS2CPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.onedex.bot.bot.Bot;

/** The server moved us (a /home or /rtp teleport, even onto the spot we already stand on). */
@Mixin(ClientPlayNetworkHandler.class)
public class TeleportMixin {
    @Inject(method = "onPlayerPositionLook", at = @At("TAIL"))
    private void dexbot$teleported(PlayerPositionLookS2CPacket packet, CallbackInfo ci) {
        Bot.INSTANCE.teleported();
    }
}
