package ru.onedex.newyear.mixin;

import net.minecraft.client.sound.MusicTracker;
import net.minecraft.client.sound.SoundInstance;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.onedex.newyear.music.MusicPlayer;

/** Vanilla background music is silenced while New Year music plays (and comes back afterwards). */
@Mixin(MusicTracker.class)
public abstract class MusicTrackerMixin {
    @Shadow
    private SoundInstance current;

    @Shadow
    public abstract void stop();

    @Inject(method = "tick", at = @At("HEAD"), cancellable = true)
    private void dexnewyear$silence(CallbackInfo ci) {
        if (MusicPlayer.isPlaying() || MusicPlayer.isPaused()) {
            if (current != null) stop();
            ci.cancel();
        }
    }
}
