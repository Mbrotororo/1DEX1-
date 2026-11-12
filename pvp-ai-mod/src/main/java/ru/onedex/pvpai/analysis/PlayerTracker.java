package ru.onedex.pvpai.analysis;

import net.minecraft.item.ItemStack;

import java.util.ArrayDeque;
import java.util.UUID;

/** Live per-entity state for every player in render distance. */
public class PlayerTracker {
    public final int entityId;
    public final UUID uuid;
    public String name;
    public Profile profile;

    public boolean hpInit;
    public float lastHp, lastAbs;
    public boolean hpEverChanged;
    public int hitsReceivedTotal;

    public boolean wasUsing;
    public ItemStack usingStack = ItemStack.EMPTY;
    public long useStartTick;

    public boolean posInit;
    public double lastX, lastZ;
    public int lastStrafeSign;

    public long lastSeenTick;
    public int lastTargetId = -1;
    public long lastTargetTick = -100000;

    public boolean seenGapple, seenTotem;
    public long strengthUntilTick = -1;
    public long currentTick;

    public float lastExpectedTaken = 4, lastExpectedDealt = 4;
    public boolean dead;

    public WinModel.Result forecast;
    public long forecastTick;

    public final ArrayDeque<PendingHit> pendingOnMe = new ArrayDeque<>();

    public PlayerTracker(int entityId, UUID uuid, String name) {
        this.entityId = entityId;
        this.uuid = uuid;
        this.name = name;
    }

    /** Server hides real health of other players (common anti-cheat feature). */
    public boolean hpHidden() {
        return hitsReceivedTotal >= 3 && !hpEverChanged;
    }

    public boolean hasStrength() {
        return currentTick < strengthUntilTick;
    }

    public static class PendingHit {
        public final int attackerId;
        public final long tick;
        public final boolean melee;
        public final float expected;
        public boolean crit;
        public float amount = -1;
        public FightSession session;
        public boolean attackerIsMe;
        public boolean shared;

        public PendingHit(int attackerId, long tick, boolean melee, float expected) {
            this.attackerId = attackerId;
            this.tick = tick;
            this.melee = melee;
            this.expected = expected;
        }
    }
}
