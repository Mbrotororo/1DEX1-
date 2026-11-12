package ru.onedex.pvpai.mixin;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayNetworkHandler;
import net.minecraft.entity.Entity;
import net.minecraft.network.packet.s2c.play.EntityAnimationS2CPacket;
import net.minecraft.network.packet.s2c.play.EntityDamageS2CPacket;
import net.minecraft.network.packet.s2c.play.EntityStatusS2CPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.onedex.pvpai.analysis.Brain;

@Mixin(ClientPlayNetworkHandler.class)
public abstract class ClientPlayNetworkHandlerMixin {
    @Inject(method = "onEntityDamage", at = @At("TAIL"))
    private void dexpvpai$damage(EntityDamageS2CPacket packet, CallbackInfo ci) {
        try {
            Brain.INSTANCE.onDamage(packet.entityId(), packet.sourceCauseId(), packet.sourceDirectId());
        } catch (Throwable ignored) {
        }
    }

    @Inject(method = "onEntityAnimation", at = @At("TAIL"))
    private void dexpvpai$animation(EntityAnimationS2CPacket packet, CallbackInfo ci) {
        try {
            Brain.INSTANCE.onAnimation(packet.getEntityId(), packet.getAnimationId());
        } catch (Throwable ignored) {
        }
    }

    @Inject(method = "onEntityStatus", at = @At("TAIL"))
    private void dexpvpai$status(EntityStatusS2CPacket packet, CallbackInfo ci) {
        try {
            MinecraftClient mc = MinecraftClient.getInstance();
            if (mc.world == null) return;
            Entity e = packet.getEntity(mc.world);
            if (e != null) Brain.INSTANCE.onStatus(e, packet.getStatus());
        } catch (Throwable ignored) {
        }
    }
}
