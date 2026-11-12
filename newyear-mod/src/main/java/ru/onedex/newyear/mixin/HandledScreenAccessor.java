package ru.onedex.newyear.mixin;

import net.minecraft.client.gui.screen.ingame.HandledScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(HandledScreen.class)
public interface HandledScreenAccessor {
    @Accessor("x")
    int dexnewyear$x();

    @Accessor("y")
    int dexnewyear$y();

    @Accessor("backgroundWidth")
    int dexnewyear$backgroundWidth();
}
