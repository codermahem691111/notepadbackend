// Daily Notepad - backend (single file)
// Run:  npm init -y && npm i express mongoose cors  &&  node server.js

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// ---- Config -------------------------------------------------------------
const PORT = 5000;
const MONGO_URI =
  "mongodb+srv://mahi:x89ce6003@cluster0.erkvemp.mongodb.net/?appName=Cluster0";
const DB_NAME = "daily-notepad";

const COLORS = ["indigo", "coral", "mint", "amber", "sky", "rose"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- Model --------------------------------------------------------------
// `date` is stored as a "YYYY-MM-DD" string so a note always belongs to the
// day the user picked, regardless of timezone.
const noteSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, match: DATE_RE, index: true },
    title: { type: String, trim: true, default: "", maxlength: 120 },
    content: { type: String, trim: true, default: "", maxlength: 5000 },
    color: { type: String, enum: COLORS, default: "indigo" },
    pinned: { type: Boolean, default: false },
    done: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Note = mongoose.model("Note", noteSchema);

// ---- App ----------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

const fail = (res, status, message) => res.status(status).json({ message });

// Notes for one day: pinned first, then newest first
app.get("/api/notes", async (req, res) => {
  try {
    const { date } = req.query;
    if (!DATE_RE.test(date || "")) return fail(res, 400, "Use ?date=YYYY-MM-DD");
    const notes = await Note.find({ date }).sort({ pinned: -1, createdAt: -1 });
    res.json(notes);
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// Note counts per day for a date range, used for the dots on the week strip
app.get("/api/notes/summary", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || ""))
      return fail(res, 400, "Use ?from=YYYY-MM-DD&to=YYYY-MM-DD");
    const rows = await Note.aggregate([
      { $match: { date: { $gte: from, $lte: to } } },
      { $group: { _id: "$date", count: { $sum: 1 } } },
    ]);
    const counts = {};
    rows.forEach((r) => (counts[r._id] = r.count));
    res.json(counts);
  } catch (err) {
    fail(res, 500, err.message);
  }
});

app.post("/api/notes", async (req, res) => {
  try {
    const { date, title, content, color, pinned } = req.body;
    if (!(title || "").trim() && !(content || "").trim())
      return fail(res, 400, "Write a title or some text first");
    const note = await Note.create({ date, title, content, color, pinned });
    res.status(201).json(note);
  } catch (err) {
    fail(res, err.name === "ValidationError" ? 400 : 500, err.message);
  }
});

app.put("/api/notes/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid note id");
    const allowed = ["title", "content", "color", "pinned", "done", "date"];
    const update = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    });
    const note = await Note.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!note) return fail(res, 404, "Note not found");
    res.json(note);
  } catch (err) {
    fail(res, err.name === "ValidationError" ? 400 : 500, err.message);
  }
});

app.delete("/api/notes/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid note id");
    const note = await Note.findByIdAndDelete(req.params.id);
    if (!note) return fail(res, 404, "Note not found");
    res.json({ message: "Note deleted" });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

app.get("/", (req, res) => res.send("Daily Notepad API is running"));

// ---- Start --------------------------------------------------------------
mongoose
  .connect(MONGO_URI, { dbName: DB_NAME })
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });