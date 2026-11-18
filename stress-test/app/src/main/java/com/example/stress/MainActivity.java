package com.example.stress;

import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * UI stress-test harness.
 *
 * On start it:
 *   - spawns 100 background worker threads, each running an infinite math loop to saturate the CPU;
 *   - hammers a dummy TextView from the main thread in tight bursts to force severe jank / frame drops;
 *   - after exactly 20 seconds, flips the kill switch to stop every thread and calls finish().
 *
 * All work is bounded to this single Activity instance and self-terminates; nothing persists past finish().
 */
public class MainActivity extends AppCompatActivity {

    /** Number of CPU-burning worker threads to spawn. */
    private static final int THREAD_COUNT = 100;

    /** Hard stop after this many milliseconds. */
    private static final long RUN_DURATION_MS = 20_000L;

    /** Master kill switch. volatile so the 20s timeout is seen by every worker/UI loop promptly. */
    private volatile boolean running = true;

    /** Keep references so we can interrupt the workers when we stop. */
    private final List<Thread> workers = new ArrayList<>(THREAD_COUNT);

    /** Shared sink so the JIT can't optimise the math loops away. */
    private final AtomicLong sink = new AtomicLong();

    private TextView dummyText;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Minimal programmatic UI: a single dummy TextView we will thrash.
        dummyText = new TextView(this);
        dummyText.setGravity(Gravity.CENTER);
        dummyText.setTextColor(Color.BLACK);
        dummyText.setText("0");
        setContentView(dummyText);

        // 1) Spawn 100 background threads, each an infinite CPU-maxing math loop.
        for (int i = 0; i < THREAD_COUNT; i++) {
            Thread t = new Thread(new CpuBurner(i), "burner-" + i);
            t.setPriority(Thread.MAX_PRIORITY);
            workers.add(t);
            t.start();
        }

        // 2) Aggressively update the dummy TextView from the main thread to freeze the UI.
        mainHandler.post(uiThrasher);

        // 3) After exactly 20 seconds: stop everything and finish the Activity.
        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                running = false;                 // workers + UI loop observe this and bail out
                for (Thread t : workers) {
                    t.interrupt();
                }
                finish();
            }
        }, RUN_DURATION_MS);
    }

    /** Infinite math loop; runs until the kill switch flips. Pure CPU, no sleeping. */
    private final class CpuBurner implements Runnable {
        private double seed;

        CpuBurner(int id) {
            this.seed = id + 1;
        }

        @Override
        public void run() {
            double x = seed;
            while (running) {
                // Transcendental churn keeps the FPU/ALU pinned.
                x = Math.sqrt(x * 1.0000001 + 1.0) + Math.sin(x) * Math.cos(x) + Math.log(x + 2.0);
                if (x > 1.0e12) {
                    x = seed; // reset to avoid overflow to Infinity, keep the work meaningful
                }
                // Occasionally publish so the loop has an observable effect (defeats dead-code elimination).
                if (((long) x & 0x3FFFF) == 0) {
                    sink.addAndGet((long) x);
                }
            }
        }
    }

    /**
     * Main-thread TextView thrasher. Each pass does a tight burst of setText + layout-forcing work,
     * monopolising the main thread so the UI freezes and drops frames. It reposts itself (instead of
     * looping forever inline) so the 20s delayed stop still gets dispatched between bursts.
     */
    private final Runnable uiThrasher = new Runnable() {
        private long tick = 0;

        @Override
        public void run() {
            if (!running) {
                return;
            }
            // Tight burst: thousands of synchronous UI mutations back-to-back == severe jank.
            for (int i = 0; i < 5000 && running; i++) {
                tick++;
                dummyText.setText(Long.toString(tick));
                dummyText.getText();               // touch state
                dummyText.requestLayout();         // force layout churn each iteration
            }
            // Repost immediately to keep the main thread saturated for the whole run.
            mainHandler.post(this);
        }
    };

    @Override
    protected void onDestroy() {
        running = false;
        mainHandler.removeCallbacksAndMessages(null);
        for (Thread t : workers) {
            t.interrupt();
        }
        super.onDestroy();
    }
}
