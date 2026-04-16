import express from "express";
import fetch from "node-fetch";
import { v7 as uuidv7 } from "uuid";
import { initDB } from "./db.js";

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

// ==============================
// POST /api/profiles
// ==============================
app.post("/api/profiles", async (req, res) => {
  const { name } = req.body;

  // ✅ 1. Check if name exists
  if (!name) {
    return res.status(400).json({
      status: "error",
      message: "Name is required",
    });
  }

  // ✅ 2. Check type (PLACE IT HERE)
  if (typeof name !== "string") {
    return res.status(422).json({
      status: "error",
      message: "Invalid type",
    });
  }

  // ✅ 3. Normalize AFTER validation
  const normalizedName = name.toLowerCase();

  // ✅ Check existing
  const existing = db
    .prepare("SELECT * FROM profiles WHERE name = ?")
    .get(normalizedName);

  if (existing) {
    return res.status(200).json({
      status: "success",
      message: "Profile already exists",
      data: "existing profile",
    });
  }

  try {
    // ✅ Fetch external APIs
    const [genderRes, ageRes, natRes] = await Promise.all([
      fetch(`https://api.genderize.io?name=${normalizedName}`),
      fetch(`https://api.agify.io?name=${normalizedName}`),
      fetch(`https://api.nationalize.io?name=${normalizedName}`),
    ]);

    const genderData = await genderRes.json();
    const ageData = await ageRes.json();
    const natData = await natRes.json();

    // ✅ Validate responses
    if (!genderData.gender || genderData.count === 0) {
      return res.status(502).json({
        status: "error",
        message: "Invalid gender data",
      });
    }

   if (genderData.gender === null || genderData.count === 0) {
  return res.status(502).json({
    status: "error",
    message: "Genderize returned an invalid response",
  });
}

// Age
if (ageData.age === null) {
  return res.status(502).json({
    status: "error",
    message: "Agify returned an invalid response",
  });
}

// Nationality
if (!natData.country || natData.country.length === 0) {
  return res.status(502).json({
    status: "error",
    message: "Nationalize returned an invalid response",
  });
}

    // ✅ Age classification
    let age_group = "adult";
    if (ageData.age <= 12) age_group = "child";
    else if (ageData.age <= 19) age_group = "teenager";
    else if (ageData.age >= 60) age_group = "senior";

    // ✅ Get top country
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

    // ✅ Insert (FIXED)
    db.prepare(
      `
      INSERT INTO profiles (
        id, name, gender, gender_probability, sample_size,
        age, age_group, country_id, country_probability, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
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

    return res.status(201).json({
      status: "success",
      data: profile,
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
});

// ==============================
// GET /api/profiles/:id
// ==============================
app.get("/api/profiles/:id", (req, res) => {
  const { id } = req.params;

  const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(id);

  if (!profile) {
    return res.status(404).json({
      status: "error",
      message: "Profile not found",
    });
  }

  return res.status(200).json({
    status: "success",
    data: profile,
  });
});

// ==============================
// GET /api/profiles (filters)
// ==============================
app.get("/api/profiles", (req, res) => {
  let { gender, country_id, age_group } = req.query;

  let query = "SELECT * FROM profiles WHERE 1=1";
  let params = [];

  if (gender) {
    query += " AND LOWER(gender) = ?";
    params.push(gender.toLowerCase());
  }

  if (country_id) {
    query += " AND LOWER(country_id) = ?";
    params.push(country_id.toLowerCase());
  }

  if (age_group) {
    query += " AND LOWER(age_group) = ?";
    params.push(age_group.toLowerCase());
  }

  const profiles = db.prepare(query).all(...params);

  return res.status(200).json({
    status: "success",
    count: profiles.length,
    data: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      gender: p.gender,
      age: p.age,
      age_group: p.age_group,
      country_id: p.country_id,
    })),
  });
});

// ==============================
// DELETE /api/profiles/:id
// ==============================
app.delete("/api/profiles/:id", (req, res) => {
  const { id } = req.params;

  const result = db.prepare("DELETE FROM profiles WHERE id = ?").run(id);

  if (result.changes === 0) {
    return res.status(404).json({
      status: "error",
      message: "Profile not found",
    });
  }

  return res.status(204).send();
});

// Export for Vercel
export default app;

// Local dev
if (process.env.NODE_ENV !== "production") {
  app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
  });
}
