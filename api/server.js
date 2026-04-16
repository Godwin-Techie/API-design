import express from "express";
import fetch from "node-fetch";
import { v7 as uuidv7 } from "uuid";
import { initDB } from "../db.js";

const app = express();
app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Initialize DB
const db = initDB();

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE,
    gender TEXT,
    gender_probability REAL,
    sample_size INTEGER,
    age INTEGER,
    age_group TEXT,
    country_id TEXT,
    country_probability REAL,
    created_at TEXT
  )
`);

// POST /api/profiles
app.post("/api/profiles", async (req, res) => {
  res.type("application/json");
  const { name } = req.body;

  // Validation
  if (name === undefined) {
    return res
      .status(400)
      .json({ status: "error", message: "Name is required" });
  }
  if (typeof name !== "string") {
    return res
      .status(422)
      .json({ status: "error", message: "Name must be a string" });
  }
  if (name.trim() === "") {
    return res
      .status(400)
      .json({ status: "error", message: "Name cannot be empty" });
  }

  const normalizedName = name.toLowerCase();

  // Check existing
  const existing = db
    .prepare("SELECT * FROM profiles WHERE name = ?")
    .get(normalizedName);
  if (existing) {
    return res.status(200).json({
      status: "success",
      data: existing,
    });
  }

  try {
    // Fetch external APIs
    const [genderRes, ageRes, natRes] = await Promise.all([
      fetch(`https://api.genderize.io?name=${normalizedName}`),
      fetch(`https://api.agify.io?name=${normalizedName}`),
      fetch(`https://api.nationalize.io?name=${normalizedName}`),
    ]);

    const genderData = await genderRes.json();
    const ageData = await ageRes.json();
    const natData = await natRes.json();

    // Validate responses
    if (!genderData.gender || genderData.count === 0) {
      return res
        .status(502)
        .json({ status: "error", message: "Invalid gender data" });
    }
    if (ageData.age === null) {
      return res
        .status(502)
        .json({ status: "error", message: "Invalid age data" });
    }
    if (!natData.country || natData.country.length === 0) {
      return res
        .status(502)
        .json({ status: "error", message: "Invalid nationality data" });
    }

    // Age classification
    let age_group = "adult";
    if (ageData.age <= 12) age_group = "child";
    else if (ageData.age <= 19) age_group = "teenager";
    else if (ageData.age >= 60) age_group = "senior";

    // Top country
    const topCountry = natData.country.reduce((a, b) =>
      a.probability > b.probability ? a : b,
    );

    const profile = {
      id: uuidv7(),
      name: normalizedName,
      gender: genderData.gender,
      gender_probability: genderData.probability,
      sample_size: genderData.count,
      age: ageData.age,
      age_group,
      country_id: topCountry.country_id,
      country_probability: topCountry.probability,
      created_at: new Date().toISOString(),
    };

    // Insert
    db.prepare(
      `INSERT INTO profiles (
        id, name, gender, gender_probability, sample_size,
        age, age_group, country_id, country_probability, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      profile.id,
      profile.name,
      profile.gender,
      profile.gender_probability,
      profile.sample_size,
      profile.age,
      profile.age_group,
      profile.country_id,
      profile.country_probability,
      profile.created_at,
    );

    return res.status(201).json({ status: "success", data: profile });
  } catch (err) {
    return res.status(500).json({ status: "error", message: "Server error" });
  }
});

// DELETE /api/profiles/:id
app.delete("/api/profiles/:id", (req, res) => {
  res.type("application/json");
  const { id } = req.params;

  const result = db.prepare("DELETE FROM profiles WHERE id = ?").run(id);

  if (result.changes === 0) {
    return res
      .status(404)
      .json({ status: "error", message: "Profile not found" });
  }

  return res
    .status(200)
    .json({ status: "success", message: "Profile deleted" });
});

if (process.env.NODE_ENV !== "production") {
  app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
  });
}

export default app;
