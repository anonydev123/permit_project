require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const path = require("path");
const { body, validationResult } = require("express-validator");
const fs = require("fs");  // Required to check file existence

// For Base64 encoding and decoding
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// Validate environment variables
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
  console.error("Missing required environment variables for database connection.");
  process.exit(1);
}

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

// Function to encode data into Base64 format
const encodeData = (data) => {
  return Buffer.from(data).toString("base64").replace(/=+$/, ""); // Remove '=' padding for clean URLs
};

// Function to decode Base64 format
const decodeData = (data) => {
  try {
    return Buffer.from(data, "base64").toString("utf-8");
  } catch (err) {
    console.error("Error decoding data:", err);
    return null;
  }
};

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "form.html"));
});

// Handle form submission
app.post(
  "/submit_form",
  [
    body("permit_number").isAlphanumeric().withMessage("Invalid permit number."),
    body("module").notEmpty().withMessage("Module is required."),
    body("validity_from").isDate().withMessage("Invalid date for validity from."),
    body("validity_till").isDate().withMessage("Invalid date for validity till."),
    body("items").notEmpty().withMessage("Items field is required."),
    body("quantity").isNumeric().withMessage("Quantity must be a number."),
    body("name").notEmpty().withMessage("Name field is required."),
    body("mobile").isMobilePhone().withMessage("Invalid mobile number."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const permitData = {
      permit_number: req.body.permit_number,
      module: req.body.module,
      validity_from: req.body.validity_from,
      validity_till: req.body.validity_till,
      items: req.body.items,
      quantity: req.body.quantity,
      name: req.body.name,
      address: req.body.address || "",
      mobile: req.body.mobile,
      vehicle_number: req.body.vehicle_number || "",
      driver_info: req.body.driver_info || "",
    };

    try {
      // Insert or update the database
      const permitQuery = `
        INSERT INTO pdf_data
        (permit_number, module, validity_from, validity_till, items, quantity, name, address, mobile, vehicle_number, driver_info)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        module = VALUES(module),
        validity_from = VALUES(validity_from),
        validity_till = VALUES(validity_till),
        items = VALUES(items),
        quantity = VALUES(quantity),
        name = VALUES(name),
        address = VALUES(address),
        mobile = VALUES(mobile),
        vehicle_number = VALUES(vehicle_number),
        driver_info = VALUES(driver_info)
      `;
      await db.promise().query(permitQuery, Object.values(permitData));

      // Encode the data into Base64 string
      const encodedString = encodeData(JSON.stringify(permitData));
      const segments = encodedString.match(/.{1,64}/g); // Split into 64-character segments

      // Construct the URL
      const domain = process.env.APP_DOMAIN || `http://localhost:${port}`;

      // Ensure the redirect URL is properly constructed
      const redirectUrl = `${domain}/etp_verification/${segments.join("/")}`;
      console.log("Redirecting to: ", redirectUrl);

      // Redirect the user
      res.redirect(redirectUrl);

    } catch (err) {
      console.error("Error processing the form:", err);
      res.status(500).send("An error occurred while processing the form.");
    }
  }
);

// Route for ETP verification
app.get("/etp_verification/:segment1/:segment2/:segment3/:segment4", (req, res) => {
  try {
    // Combine all segments into a single string
    const encodedString = [
      req.params.segment1,
      req.params.segment2,
      req.params.segment3,
      req.params.segment4,
    ].join(""); // Ensure this concatenation is correct

    // Decode the data
    const decodedString = decodeData(encodedString);

    if (!decodedString) {
      throw new Error("Invalid or corrupted data.");
    }

    const permitData = JSON.parse(decodedString);

    // Render the details page
    res.render("details", { data: permitData });
  } catch (err) {
    console.error("Error processing the URL:", err);
    res.status(400).send("Invalid or corrupted URL.");
  }
});

// Serve PDF files from the 'pdf' directory
app.get("/pdf/:id", (req, res) => {
  const pdfPath = path.join(__dirname, "pdf", req.params.id); // PDF file path based on the ID

  // Check if the PDF exists before trying to serve it
  if (fs.existsSync(pdfPath)) {
    res.sendFile(pdfPath); // Send the PDF file
  } else {
    res.status(404).send("PDF not found.");
  }
});

// Server
app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on http://localhost:${port}`);
});
