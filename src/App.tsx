import { type CSSProperties, useMemo, useState } from "react";

type WorkoutType = "Cardio" | "Strength" | "Mobility";

type WorkoutLog = {
  id: string;
  date: string;
  type: WorkoutType;
  duration: number;
  calories: number;
  notes: string;
};

const DAILY_WATER_TARGET_ML = 2500;

const initialLogs: WorkoutLog[] = [
  {
    id: "w1",
    date: "2026-04-18",
    type: "Cardio",
    duration: 35,
    calories: 280,
    notes: "Interval run",
  },
  {
    id: "w2",
    date: "2026-04-19",
    type: "Strength",
    duration: 45,
    calories: 320,
    notes: "Upper body + core",
  },
];

function App() {
  const [name, setName] = useState("Athlete");
  const [goalWorkouts, setGoalWorkouts] = useState(5);
  const [weeklySteps, setWeeklySteps] = useState(56000);
  const [waterIntakeMl, setWaterIntakeMl] = useState(1300);
  const [heightCm, setHeightCm] = useState(170);
  const [weightKg, setWeightKg] = useState(68);
  const [logs, setLogs] = useState<WorkoutLog[]>(initialLogs);
  const [newLog, setNewLog] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: "Cardio" as WorkoutType,
    duration: 30,
    calories: 250,
    notes: "",
  });

  const completedWorkouts = logs.length;
  const workoutsProgress = Math.min(100, Math.round((completedWorkouts / Math.max(goalWorkouts, 1)) * 100));
  const waterProgress = Math.min(100, Math.round((waterIntakeMl / DAILY_WATER_TARGET_ML) * 100));

  const bmi = useMemo(() => {
    const meters = heightCm / 100;
    if (meters <= 0) return 0;
    return +(weightKg / (meters * meters)).toFixed(1);
  }, [heightCm, weightKg]);

  const bmiLabel = useMemo(() => {
    if (bmi === 0) return "N/A";
    if (bmi < 18.5) return "Underweight";
    if (bmi < 25) return "Healthy";
    if (bmi < 30) return "Overweight";
    return "Obese";
  }, [bmi]);

  const totalDuration = logs.reduce((sum, item) => sum + item.duration, 0);
  const totalCalories = logs.reduce((sum, item) => sum + item.calories, 0);
  const cardioCount = logs.filter((item) => item.type === "Cardio").length;
  const strengthCount = logs.filter((item) => item.type === "Strength").length;
  const mobilityCount = logs.filter((item) => item.type === "Mobility").length;

  const addWorkout = () => {
    if (!newLog.date || newLog.duration <= 0 || newLog.calories <= 0) {
      return;
    }
    setLogs((prev) => [
      {
        id: crypto.randomUUID(),
        date: newLog.date,
        type: newLog.type,
        duration: newLog.duration,
        calories: newLog.calories,
        notes: newLog.notes.trim(),
      },
      ...prev,
    ]);
    setNewLog((prev) => ({ ...prev, notes: "" }));
  };

  const removeWorkout = (id: string) => {
    setLogs((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.heading}>FitTrack Pro</h1>
          <p style={styles.subheading}>Personal fitness dashboard</p>
        </header>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Profile</h2>
          <div style={styles.grid2}>
            <label style={styles.field}>
              <span>Name</span>
              <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label style={styles.field}>
              <span>Weekly workout goal</span>
              <input
                style={styles.input}
                type="number"
                min={1}
                value={goalWorkouts}
                onChange={(e) => setGoalWorkouts(Number(e.target.value))}
              />
            </label>
            <label style={styles.field}>
              <span>Height (cm)</span>
              <input
                style={styles.input}
                type="number"
                min={80}
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
              />
            </label>
            <label style={styles.field}>
              <span>Weight (kg)</span>
              <input
                style={styles.input}
                type="number"
                min={20}
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value))}
              />
            </label>
          </div>
          <p style={styles.welcome}>
            Hello, <strong>{name || "Athlete"}</strong>. Keep pushing today.
          </p>
        </section>

        <section style={styles.metricsGrid}>
          <article style={styles.metricCard}>
            <h3>Workout Progress</h3>
            <p style={styles.metricText}>
              {completedWorkouts}/{goalWorkouts} sessions
            </p>
            <Progress percent={workoutsProgress} color="#4f46e5" />
          </article>
          <article style={styles.metricCard}>
            <h3>Hydration</h3>
            <p style={styles.metricText}>
              {waterIntakeMl} / {DAILY_WATER_TARGET_ML} ml
            </p>
            <Progress percent={waterProgress} color="#0284c7" />
            <div style={styles.inlineActions}>
              <button style={styles.buttonSecondary} onClick={() => setWaterIntakeMl((v) => v + 250)}>
                +250 ml
              </button>
              <button style={styles.buttonSecondary} onClick={() => setWaterIntakeMl((v) => Math.max(0, v - 250))}>
                -250 ml
              </button>
            </div>
          </article>
          <article style={styles.metricCard}>
            <h3>BMI</h3>
            <p style={styles.metricText}>{bmi}</p>
            <p>{bmiLabel}</p>
          </article>
          <article style={styles.metricCard}>
            <h3>Weekly Steps</h3>
            <p style={styles.metricText}>{weeklySteps.toLocaleString()}</p>
            <input
              style={styles.input}
              type="number"
              min={0}
              value={weeklySteps}
              onChange={(e) => setWeeklySteps(Number(e.target.value))}
            />
          </article>
        </section>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Add Workout</h2>
          <div style={styles.grid3}>
            <label style={styles.field}>
              <span>Date</span>
              <input
                style={styles.input}
                type="date"
                value={newLog.date}
                onChange={(e) => setNewLog((prev) => ({ ...prev, date: e.target.value }))}
              />
            </label>
            <label style={styles.field}>
              <span>Type</span>
              <select
                style={styles.input}
                value={newLog.type}
                onChange={(e) => setNewLog((prev) => ({ ...prev, type: e.target.value as WorkoutType }))}
              >
                <option>Cardio</option>
                <option>Strength</option>
                <option>Mobility</option>
              </select>
            </label>
            <label style={styles.field}>
              <span>Duration (min)</span>
              <input
                style={styles.input}
                type="number"
                min={1}
                value={newLog.duration}
                onChange={(e) => setNewLog((prev) => ({ ...prev, duration: Number(e.target.value) }))}
              />
            </label>
            <label style={styles.field}>
              <span>Calories</span>
              <input
                style={styles.input}
                type="number"
                min={1}
                value={newLog.calories}
                onChange={(e) => setNewLog((prev) => ({ ...prev, calories: Number(e.target.value) }))}
              />
            </label>
            <label style={{ ...styles.field, gridColumn: "1 / -1" }}>
              <span>Notes</span>
              <input
                style={styles.input}
                placeholder="Example: Leg day + stretching"
                value={newLog.notes}
                onChange={(e) => setNewLog((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </label>
          </div>
          <button style={styles.buttonPrimary} onClick={addWorkout}>
            Save Workout
          </button>
        </section>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Workout History</h2>
          <div style={styles.summaryRow}>
            <p>Total Duration: {totalDuration} min</p>
            <p>Total Calories: {totalCalories} kcal</p>
            <p>Cardio: {cardioCount}</p>
            <p>Strength: {strengthCount}</p>
            <p>Mobility: {mobilityCount}</p>
          </div>
          <div style={styles.logsList}>
            {logs.map((item) => (
              <article key={item.id} style={styles.logCard}>
                <div>
                  <p style={styles.logTitle}>
                    {item.type} • {item.date}
                  </p>
                  <p>
                    {item.duration} min • {item.calories} kcal
                  </p>
                  {item.notes ? <p>{item.notes}</p> : null}
                </div>
                <button style={styles.buttonDanger} onClick={() => removeWorkout(item.id)}>
                  Delete
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Progress({ percent, color }: { percent: number; color: string }) {
  return (
    <div style={styles.progressTrack}>
      <div style={{ ...styles.progressFill, background: color, width: `${percent}%` }} />
      <span style={styles.progressLabel}>{percent}%</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(120deg, #eef2ff, #f8fafc)",
    fontFamily: "Inter, Segoe UI, sans-serif",
    color: "#0f172a",
    padding: "24px 12px",
  },
  container: {
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gap: 16,
  },
  header: {
    textAlign: "center",
    marginBottom: 8,
  },
  heading: {
    margin: 0,
    fontSize: "2rem",
  },
  subheading: {
    margin: 0,
    color: "#475569",
  },
  card: {
    background: "#ffffff",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 10px 30px rgba(2,6,23,0.08)",
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 12,
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 12,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 12,
  },
  metricCard: {
    background: "#fff",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
  },
  metricText: {
    fontSize: "1.4rem",
    marginTop: 4,
    marginBottom: 8,
    fontWeight: 600,
  },
  field: {
    display: "grid",
    gap: 6,
    fontSize: 14,
  },
  input: {
    padding: "10px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    fontSize: 14,
  },
  buttonPrimary: {
    padding: "10px 16px",
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontWeight: 600,
    cursor: "pointer",
  },
  buttonSecondary: {
    padding: "8px 12px",
    background: "#e2e8f0",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  buttonDanger: {
    padding: "8px 12px",
    background: "#fee2e2",
    border: "none",
    borderRadius: 8,
    color: "#991b1b",
    cursor: "pointer",
    height: "fit-content",
  },
  welcome: {
    marginBottom: 0,
    color: "#334155",
  },
  progressTrack: {
    position: "relative",
    background: "#e2e8f0",
    borderRadius: 99,
    height: 16,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 99,
    transition: "width 0.25s ease",
  },
  progressLabel: {
    position: "absolute",
    right: 8,
    top: -1,
    fontSize: 12,
    color: "#0f172a",
    fontWeight: 700,
  },
  inlineActions: {
    display: "flex",
    gap: 8,
    marginTop: 8,
  },
  summaryRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    color: "#334155",
    marginBottom: 12,
  },
  logsList: {
    display: "grid",
    gap: 10,
  },
  logCard: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 12,
  },
  logTitle: {
    margin: 0,
    fontWeight: 600,
  },
};

export default App;
