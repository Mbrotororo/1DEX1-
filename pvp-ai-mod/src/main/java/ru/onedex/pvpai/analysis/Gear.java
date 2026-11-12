package ru.onedex.pvpai.analysis;

import it.unimi.dsi.fastutil.objects.Object2IntMap;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.AttributeModifiersComponent;
import net.minecraft.component.type.PotionContentsComponent;
import net.minecraft.enchantment.Enchantment;
import net.minecraft.enchantment.Enchantments;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.attribute.EntityAttributeModifier;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.util.math.MathHelper;

/** Equipment / inventory evaluation and vanilla damage math. */
public final class Gear {
    private Gear() {}

    public static final EquipmentSlot[] ARMOR = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};

    public static int enchLevel(ItemStack stack, RegistryKey<Enchantment> key) {
        if (stack == null || stack.isEmpty()) return 0;
        try {
            for (Object2IntMap.Entry<RegistryEntry<Enchantment>> e : stack.getEnchantments().getEnchantmentEntries()) {
                if (e.getKey().matchesKey(key)) return e.getIntValue();
            }
        } catch (Exception ignored) {
        }
        return 0;
    }

    /** Raw weapon damage with full cooldown (player base damage 1 + item modifiers). */
    public static float weaponDamage(ItemStack stack) {
        float[] add = {1.0f};
        if (stack != null && !stack.isEmpty()) {
            AttributeModifiersComponent mods = stack.getOrDefault(DataComponentTypes.ATTRIBUTE_MODIFIERS, AttributeModifiersComponent.DEFAULT);
            mods.applyModifiers(EquipmentSlot.MAINHAND, (attr, mod) -> {
                if (attr.matches(EntityAttributes.ATTACK_DAMAGE) && mod.operation() == EntityAttributeModifier.Operation.ADD_VALUE) {
                    add[0] += (float) mod.value();
                }
            });
            int sharp = enchLevel(stack, Enchantments.SHARPNESS);
            if (sharp > 0) add[0] += 0.5f * sharp + 0.5f;
        }
        return add[0];
    }

    /** Attacks per second at full charge. */
    public static float attackSpeed(ItemStack stack) {
        float[] speed = {4.0f};
        if (stack != null && !stack.isEmpty()) {
            AttributeModifiersComponent mods = stack.getOrDefault(DataComponentTypes.ATTRIBUTE_MODIFIERS, AttributeModifiersComponent.DEFAULT);
            mods.applyModifiers(EquipmentSlot.MAINHAND, (attr, mod) -> {
                if (attr.matches(EntityAttributes.ATTACK_SPEED) && mod.operation() == EntityAttributeModifier.Operation.ADD_VALUE) {
                    speed[0] += (float) mod.value();
                }
            });
        }
        return MathHelper.clamp(speed[0], 0.25f, 4.0f);
    }

    public static int protectionEpf(LivingEntity e) {
        int epf = 0;
        for (EquipmentSlot s : ARMOR) epf += enchLevel(e.getEquippedStack(s), Enchantments.PROTECTION);
        return Math.min(20, epf);
    }

    public static float armorReduce(float dmg, float armor, float toughness) {
        float f = 2.0f + toughness / 4.0f;
        float g = MathHelper.clamp(armor - dmg / f, armor * 0.2f, 20.0f);
        return dmg * (1.0f - g / 25.0f);
    }

    public static float toughness(LivingEntity e) {
        try {
            return (float) e.getAttributeValue(EntityAttributes.ARMOR_TOUGHNESS);
        } catch (Exception ex) {
            return 0;
        }
    }

    /** Expected damage of one full-charge, non-crit melee hit. */
    public static float expectedMelee(PlayerEntity attacker, LivingEntity victim, float extraStrength) {
        if (attacker == null || victim == null) return 4.0f;
        float dmg = weaponDamage(attacker.getMainHandStack());
        StatusEffectInstance str = attacker.getStatusEffect(StatusEffects.STRENGTH);
        if (str != null) dmg += 3.0f * (str.getAmplifier() + 1);
        else dmg += extraStrength;
        dmg = armorReduce(dmg, victim.getArmor(), toughness(victim));
        dmg *= 1.0f - protectionEpf(victim) / 25.0f;
        StatusEffectInstance res = victim.getStatusEffect(StatusEffects.RESISTANCE);
        if (res != null) dmg *= Math.max(0f, 1.0f - 0.2f * (res.getAmplifier() + 1));
        return Math.max(0.2f, dmg);
    }

    /** Armor quality 0..1 (armor points + toughness + protection). */
    public static double armorQuality(LivingEntity e) {
        double a = e.getArmor() / 20.0;
        double t = toughness(e) / 12.0;
        double p = protectionEpf(e) / 16.0;
        return MathHelper.clamp(a * 0.6 + t * 0.2 + p * 0.2, 0, 1);
    }

    /** Known resources of the local player. */
    public static Reserve myReserve(PlayerEntity p) {
        Reserve r = new Reserve();
        r.exact = true;
        PlayerInventory inv = p.getInventory();
        for (int i = 0; i < inv.size(); i++) count(r, inv.getStack(i));
        r.totemInOffhand = p.getOffHandStack().isOf(Items.TOTEM_OF_UNDYING);
        return r;
    }

    private static void count(Reserve r, ItemStack s) {
        if (s == null || s.isEmpty()) return;
        int c = s.getCount();
        if (s.isOf(Items.GOLDEN_APPLE)) r.gapples += c;
        else if (s.isOf(Items.ENCHANTED_GOLDEN_APPLE)) r.egapples += c;
        else if (s.isOf(Items.TOTEM_OF_UNDYING)) r.totems += c;
        else if (s.isOf(Items.ENDER_PEARL)) r.pearls += c;
        else if (s.isOf(Items.POTION) || s.isOf(Items.SPLASH_POTION) || s.isOf(Items.LINGERING_POTION)) {
            PotionContentsComponent pc = s.get(DataComponentTypes.POTION_CONTENTS);
            if (pc == null) return;
            for (StatusEffectInstance e : pc.getEffects()) {
                if (e.getEffectType().equals(StatusEffects.INSTANT_HEALTH)) {
                    r.healPotions += c;
                    r.potionHp += c * (4 << Math.min(3, e.getAmplifier()));
                } else if (e.getEffectType().equals(StatusEffects.REGENERATION)) {
                    r.healPotions += c;
                    r.potionHp += c * 6;
                } else if (e.getEffectType().equals(StatusEffects.STRENGTH)) {
                    r.strengthPotions += c;
                }
            }
        } else if (s.contains(DataComponentTypes.FOOD)) {
            r.food += c;
        }
    }

    public static class Reserve {
        public boolean exact;
        public int gapples, egapples, totems, pearls, healPotions, strengthPotions, food;
        public int potionHp;
        public boolean totemInOffhand;
        public double estimatedHp = -1;

        /** Extra HP these resources can give during a fight. */
        public double hp() {
            if (!exact) return estimatedHp;
            double hp = Math.min(gapples, 16) * 6.0 + Math.min(egapples, 8) * 18.0 + Math.min(totems, 6) * 10.0
                    + Math.min(potionHp, 64) + Math.min(food, 16) * 0.4;
            return Math.min(hp, 120);
        }
    }
}
