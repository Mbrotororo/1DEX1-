package ru.onedex.pvpai.analysis;

/** Everything one fighter did during one fight session. */
public class SideStats {
    public int swings;
    public int meleeHits;
    public int rangedHits;
    public int crits;
    public int hitsTaken;
    public float damageDealt;
    public boolean damageEstimated;

    public int combo;
    public int maxCombo;

    public double aimErrSum;
    public int aimSamples;
    public double strafeSum;
    public int strafeSamples;
    public double distSum;
    public int distSamples;
    public double chargeSum;
    public int chargeSamples;

    public int gapples;
    public int egapples;
    public int totems;
    public int pearls;
    public int potions;
    public int shieldBlocks;
    public float healed;

    public int totalHits() {
        return meleeHits + rangedHits;
    }

    public double accuracy() {
        if (swings <= 0) return -1;
        return Math.min(1.0, meleeHits / (double) swings);
    }

    public double aimError() {
        return aimSamples == 0 ? -1 : aimErrSum / aimSamples;
    }

    public double strafe() {
        return strafeSamples == 0 ? -1 : strafeSum / strafeSamples;
    }

    public double avgDistance() {
        return distSamples == 0 ? -1 : distSum / distSamples;
    }

    public double critRate() {
        return meleeHits == 0 ? -1 : Math.min(1.0, crits / (double) meleeHits);
    }

    public double charge() {
        return chargeSamples == 0 ? -1 : chargeSum / chargeSamples;
    }

    /** Healing value used so far, in HP. */
    public double healUsedHp() {
        return gapples * 6.0 + egapples * 18.0 + totems * 10.0 + potions * 5.0;
    }
}
