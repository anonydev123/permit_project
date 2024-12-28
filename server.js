require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const pdfLib = require("pdf-lib");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// Database connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  dateStrings: true,
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    return;
  }
  console.log("Connected to the database.");
});

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "form.html"));
});

app.post("/submit", async (req, res) => {
  const {
    permitNumber,
    validFrom,
    validTo,
    itemName,
    quantity,
    source,
    destination,
  } = req.body;

  const insertQuery = `INSERT INTO permits (permitNumber, validFrom, validTo, itemName, quantity, source, destination) VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.query(
    insertQuery,
    [permitNumber, validFrom, validTo, itemName, quantity, source, destination],
    async (err) => {
      if (err) {
        console.error("Error inserting data:", err);
        return res.status(500).send("Error saving data.");
      }

      try {
        const pdfPath = path.join(__dirname, "pdf", "final.pdf");
        const pdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await pdfLib.PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();

        form.getTextField("permitNumber").setText(permitNumber);
        form.getTextField("validFrom").setText(validFrom);
        form.getTextField("validTo").setText(validTo);
        form.getTextField("itemName").setText(itemName);
        form.getTextField("quantity").setText(quantity);
        form.getTextField("source").setText(source);
        form.getTextField("destination").setText(destination);

        const updatedPdfBytes = await pdfDoc.save();
        const outputPath = path.join(__dirname, "output", "filled.pdf");
        fs.writeFileSync(outputPath, updatedPdfBytes);

        const selectQuery = `SELECT * FROM permits WHERE permitNumber = ?`;
        db.query(selectQuery, [permitNumber], (err, results) => {
          if (err) {
            console.error("Error retrieving data:", err);
            return res.status(500).send("Error retrieving data.");
          }

          const permitData = results[0];
          res.render("details", {
            permitData,
            pdfPath: "/output/filled.pdf",
          });
        });
      } catch (err) {
        console.error("Error generating PDF:", err);
        res.status(500).send("Error generating PDF.");
      }
    }
  );
});

// Static route for filled PDFs
app.use("/output", express.static(path.join(__dirname, "output")));

// Server
app.listen(port,"0.0.0.0", () => {
  console.log(`Server is running on http://localhost:${port}`);
});





