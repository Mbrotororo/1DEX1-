package ru.onedex.pvpai.analysis;

/** Long-term memory about one player (persisted between game sessions). */
public class Profile {
    public String name = "";
    public long lastSeen;

    public int swings;
    public int hits;
    public int crits;
    public int hitsTaken;
    public double aimErrSum;
    public int aimSamples;
    public double strafeSum;
    public int strafeSamples;
    public double chargeSum;
    public int chargeSamples;
    public int gapples;
    public int totems;
    public int pearls;
    public int potions;
    public int fightsWithMe;
    public int winsVsMe;
    public int lossesVsMe;

    public double accuracy() {
        return swings < 8 ? -1 : Math.min(1.0, hits / (double) swings);
    }

    public double aimError() {
        return aimSamples < 20 ? -1 : aimErrSum / aimSamples;
    }

    public double strafe() {
        return strafeSamples < 20 ? -1 : strafeSum / strafeSamples;
    }

    public double critRate() {
        return hits < 5 ? -1 : Math.min(1.0, crits / (double) hits);
    }

    public double trade() {
        int n = hits + hitsTaken;
        return n < 6 ? -1 : hits / (double) n;
    }

    public double charge() {
        return chargeSamples < 4 ? -1 : chargeSum / chargeSamples;
    }

    /** How much we know about this player (0..1). */
    public double knowledge() {
        double n = hits + hitsTaken + aimSamples / 20.0 + swings / 3.0;
        return Math.min(1.0, n / 80.0);
    }
}
