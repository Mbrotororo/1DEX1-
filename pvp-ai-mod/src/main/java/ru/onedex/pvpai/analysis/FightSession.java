package ru.onedex.pvpai.analysis;

import java.util.UUID;

/** A fight between the local player and one enemy. */
public class FightSession {
    public final UUID enemyUuid;
    public int enemyId;
    public String enemyName;

    public final SideStats me = new SideStats();
    public final SideStats enemy = new SideStats();

    public final long startTick;
    public long lastExchangeTick;
    public long lastMyHitTick = -100000;
    public long lastEnemyHitTick = -100000;
    public double activeSeconds;

    /** Analysis reached the configured duration (or fight ended with enough data). */
    public boolean done;
    public boolean partial;
    public boolean announced;
    public boolean ended;
    public Boolean outcomeWin;

    public WinModel.Result result;
    public WinModel.Result live;

    public FightSession(UUID enemyUuid, int enemyId, String enemyName, long tick) {
        this.enemyUuid = enemyUuid;
        this.enemyId = enemyId;
        this.enemyName = enemyName;
        this.startTick = tick;
        this.lastExchangeTick = tick;
    }

    public SideStats side(boolean mine) {
        return mine ? me : enemy;
    }
}
