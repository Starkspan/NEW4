
// Projekt: PDF Pricing Tool (Backend mit Maß-Erkennung)
// Stack: Node.js + Express + pdf-parse + Multer + Render Deployment

import express from "express";
import multer from "multer";
import fs from "fs";
import pdfParse from "pdf-parse";

const app = express();
const port = process.env.PORT || 10000;

const upload = multer({ dest: "uploads/" });

function calcWeight(length, width, thickness, density = 2.7) {
  const volume = (length / 1000) * (width / 1000) * (thickness / 1000); // m3
  return +(volume * density).toFixed(2); // kg
}

function detectDimensions(text) {
  const patterns = [
    /([0-9]{2,4})\s?[xX×]\s?([0-9]{2,4})\s?[xX×]\s?([0-9]{1,4})/,
    /L[:=]?\s?([0-9]{2,4})\s?mm?.*?B[:=]?\s?([0-9]{2,4})\s?mm?.*?H[:=]?\s?([0-9]{1,4})\s?mm?/,
    /Ø\s?([0-9]{2,4})\s?[xX×]\s?([0-9]{2,4})/,
    /d[:=]?\s?([0-9]{2,4}).*?l[:=]?\s?([0-9]{2,4})/
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match) {
      if (match.length === 4) return {
        length: parseInt(match[1]),
        width: parseInt(match[2]),
        thickness: parseInt(match[3]),
        form: "quader"
      };
      if (match.length === 3) return {
        diameter: parseInt(match[1]),
        length: parseInt(match[2]),
        form: "zylinder"
      };
    }
  }
  return null;
}

app.post("/api/price", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    const text = pdfData.text;

    const dims = detectDimensions(text);
    let weight = 0, form = "unbekannt";
    let length = 0, width = 0, thickness = 0;

    if (dims) {
      form = dims.form;
      if (form === "quader") {
        length = dims.length;
        width = dims.width;
        thickness = dims.thickness;
        weight = calcWeight(length, width, thickness);
      }
      if (form === "zylinder") {
        const r = dims.diameter / 2000;
        const l = dims.length / 1000;
        weight = +(Math.PI * r * r * l * 2.7).toFixed(2);
      }
    }

    const materialPrice = parseFloat(req.body.materialPrice || 7);
    const quantity = parseInt(req.body.quantity || 1);

    const materialCost = weight * materialPrice;
    const machiningMinutes = 6 + (weight * 0.8);
    const hourlyRate = 35;
    const machiningCost = (machiningMinutes / 60) * hourlyRate;
    const setupCost = 60 / quantity;
    const programmingCost = 30 / quantity;

    const total = (materialCost + machiningCost + setupCost + programmingCost) * 1.15;
    const pricePerPiece = +(total).toFixed(2);

    fs.unlinkSync(filePath);

    res.json({
      recognized: {
        form,
        length,
        width,
        thickness,
        weight
      },
      pricePerPiece,
      machiningMinutes: +machiningMinutes.toFixed(1)
    });
  } catch (err) {
    console.error("Fehler bei der Preisberechnung:", err);
    res.status(500).json({ error: "Analysefehler. Bitte PDF prüfen." });
  }
});

app.get("/", (req, res) => {
  res.send("PDF Pricing Tool Backend ist aktiv.");
});

app.listen(port, () => {
  console.log(`PDF-Preistool mit Maß-Erkennung läuft auf Port ${port}`);
});
