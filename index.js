const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const cors = require("cors");
const socketIO = require('socket.io');
const http = require('http'); // Add this line to use the HTTP server


// Create an instance of express
const app = express();
const server = http.createServer(app);

const io = socketIO(server);






// Middleware
app.use(bodyParser.json({ limit: '100mb' })); // For JSON payloads
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true })); // For URL-encoded payloads
app.use(cors());

// MySQL connection setup
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "property",
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err.stack);
    return;
  }
  console.log("Connected to MySQL database");
});

// API to fetch all leads
app.get("/leads", (req, res) => {
  const query = "SELECT * FROM leads";
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.json(results);
  });
});

app.get("/contacts", (req, res) => {
  const query = "SELECT * FROM phonenumber";
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.json(results);
  });
});

app.get("/inventory", (req, res) => {
  const query = "SELECT * FROM new_inventory";
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.json(results);
  });
});

app.post('/add-phonenumber', (req, res) => {
  const { phonenumber, name, type } = req.body;

  const query = 'INSERT INTO phonenumber (phonenumber, name, type) VALUES (?, ?, ?)';
  const values = [phonenumber, name, type || null]; // 'type' is optional

  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Error inserting data:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(201).json({ message: 'Phone number added successfully', id: result.insertId });
  });
});


app.get("/schedule", (req, res) => {
  const query = "SELECT * FROM scheduling";
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.json(results);
  });
});

// API to add a new lead
app.post("/leads", (req, res) => {
  console.log("calling");
  const { name, contact_number, date, interest_in_property, location } =
    req.body;
  const query =
    "INSERT INTO leads (name, phoneNo, date, interestedProperty, location) VALUES (?, ?, ?, ?, ?)";
  const values = [name, contact_number, date, interest_in_property, location];

  db.query(query, values, (err, result) => {
    if (err) {
      return res.status(500).send(err);
    }
    res.json({ id: result.insertId, ...req.body });
  });
});


// Add a new endpoint for saving selected properties for a lead
app.post('/leads/properties', (req, res) => {
  const { lead_id, selectedInventoryIds } = req.body;

  // Ensure both lead_id and selectedInventoryIds are provided
  if (!lead_id || !selectedInventoryIds || !Array.isArray(selectedInventoryIds)) {
    return res.status(400).send('Invalid request: lead_id and selectedInventoryIds are required.');
  }

  // SQL query to check if there is an existing entry for the lead_id
  const checkQuery = 'SELECT * FROM properties WHERE lead_id = ?';

  db.query(checkQuery, [lead_id], (err, result) => {
    if (err) {
      console.error('Error checking lead:', err);
      return res.status(500).send('Error checking lead');
    }

    // Prepare to fetch inventory details based on selected IDs
    const fetchQuery = 'SELECT * FROM new_inventory WHERE id IN (' + selectedInventoryIds.map(() => '?').join(',') + ')';

    db.query(fetchQuery, selectedInventoryIds, (err, inventoryDetails) => {
      if (err) {
        console.error('Error fetching inventory details:', err);
        return res.status(500).send('Error fetching inventory details');
      }

      // If no entry exists for the lead_id, insert a new row
      if (result.length === 0) {
        const insertQuery = `
          INSERT INTO properties (lead_id, properties_to_be_shown)
          VALUES (?, ?)
        `;
        db.query(insertQuery, [lead_id, JSON.stringify(selectedInventoryIds)], (err) => {
          if (err) {
            console.error('Error saving properties:', err);
            return res.status(500).send('Error saving properties');
          }
          return res.status(201).json({
            message: 'Selected properties saved successfully',
            selectedInventoryDetails: inventoryDetails // Send inventory details
          });
        });
      } else {
        // If an entry exists for the lead_id, update the existing row
        const updateQuery = `
          UPDATE properties
          SET properties_to_be_shown = ?
          WHERE lead_id = ?
        `;
        db.query(updateQuery, [JSON.stringify(selectedInventoryIds), lead_id], (err) => {
          if (err) {
            console.error('Error updating properties:', err);
            return res.status(500).send('Error updating properties');
          }
          return res.status(200).json({
            message: 'Selected properties updated successfully',
            selectedInventoryDetails: inventoryDetails // Send inventory details
          });
        });
      }
    });
  });
});


app.post('/leads/visited-properties', (req, res) => {
  const { lead_id, visited_properties } = req.body;

  // Ensure both lead_id and visited_properties are provided
  if (!lead_id || !visited_properties || !Array.isArray(visited_properties)) {
      return res.status(400).send('Invalid request: lead_id and visited_properties are required.');
  }

  // SQL query to check if there is an existing entry for the lead_id
  const checkQuery = 'SELECT * FROM properties WHERE lead_id = ?';

  db.query(checkQuery, [lead_id], (err, result) => {
      if (err) {
          console.error('Error checking lead:', err);
          return res.status(500).send('Error checking lead');
      }

      // If no entry exists for the lead_id, insert a new row
      if (result.length === 0) {
          const insertQuery = `
              INSERT INTO properties (lead_id, shownproperties)
              VALUES (?, ?)
          `;
          db.query(insertQuery, [lead_id, JSON.stringify(visited_properties)], (err) => {
              if (err) {
                  console.error('Error saving properties:', err);
                  return res.status(500).send('Error saving properties');
              }
              return res.status(201).json({
                  message: 'Shown properties saved successfully',
              });
          });
      } else {
          // If an entry exists for the lead_id, update the existing row
          const existingShownProperties = JSON.parse(result[0].shownproperties || '[]');

          // Combine existing properties with new ones, avoiding duplicates
          const updatedShownProperties = Array.from(new Set([...existingShownProperties, ...visited_properties]));

          const updateQuery = `
              UPDATE properties
              SET shownproperties = ?
              WHERE lead_id = ?
          `;
          db.query(updateQuery, [JSON.stringify(updatedShownProperties), lead_id], (err) => {
              if (err) {
                  console.error('Error updating properties:', err);
                  return res.status(500).send('Error updating properties');
              }
              return res.status(200).json({
                  message: 'Shown properties updated successfully',
              });
          });
      }
  });
});





app.post('/leads/properties/notvisited', (req, res) => {
  const { lead_id } = req.body; // Get lead_id from the request body

  // Ensure lead_id is provided
  if (!lead_id) {
    return res.status(400).send('Invalid request: lead_id is required.');
  }

  // SQL query to fetch properties for the given lead_id
  const query = 'SELECT properties_to_be_shown FROM properties WHERE lead_id = ?';

  db.query(query, [lead_id], (err, result) => {
    if (err) {
      console.error('Error fetching properties:', err);
      return res.status(500).send('Error fetching properties');
    }

    if (result.length === 0) {
      return res.status(404).send('No properties found for this lead');
    }

    // Get the array of property IDs from the result
    const propertyIds = JSON.parse(result[0].properties_to_be_shown);

    // Prepare to fetch inventory details based on property IDs
    const fetchQuery = 'SELECT * FROM new_inventory WHERE id IN (' + propertyIds.map(() => '?').join(',') + ')';
    db.query(fetchQuery, propertyIds, (err, inventoryDetails) => {
      if (err) {
        console.error('Error fetching inventory details:', err);
        return res.status(500).send('Error fetching inventory details');
      }

      // Return the inventory details as a response
      res.json(inventoryDetails);
    });
  });
});


app.post('/leads/properties/visited', (req, res) => {
  const { lead_id } = req.body; // Get lead_id from the request body

  // Ensure lead_id is provided
  if (!lead_id) {
    return res.status(400).send('Invalid request: lead_id is required.');
  }

  // SQL query to fetch properties for the given lead_id
  const query = 'SELECT shownproperties FROM properties WHERE lead_id = ?';

  db.query(query, [lead_id], (err, result) => {
    if (err) {
      console.error('Error fetching properties:', err);
      return res.status(500).send('Error fetching properties');
    }

    if (result.length === 0) {
      return res.status(404).send('No properties found for this lead');
    }

    // Get the array of property IDs from the result
    const propertyIds = JSON.parse(result[0].shownproperties);

    // Prepare to fetch inventory details based on property IDs
    const fetchQuery = 'SELECT * FROM new_inventory WHERE id IN (' + propertyIds.map(() => '?').join(',') + ')';
    db.query(fetchQuery, propertyIds, (err, inventoryDetails) => {
      if (err) {
        console.error('Error fetching inventory details:', err);
        return res.status(500).send('Error fetching inventory details');
      }

      // Return the inventory details as a response
      res.json(inventoryDetails);
    });
  });
});





app.post('/inventory-details', (req, res) => {
  const {
    propertyType, 
    floorsAvailable, 
    facing, 
    open, 
    totalAskingPrice, 
    twoSideOpen, 
    threeSideOpen, 
    fourSideOpen,
    builderFlooroptions, 
    bhk, 
    area, 
    areaUnit, 
    lengthUnit, 
    address, 
    ownerType, 
    name, 
    phoneNumber, 
    images,
    askingPrice, 
    propertyCondition, 
    featureType, 
    timeLimit, 
    parking, 
    swimmingPool, 
    floors, 
    toilets, 
    brochure, 
    payment_schedule, 
    scanned_documents, 
    back, 
    front, 
    length, 
    contact_details, 
    apartment_dats, 
    rent_sale
  } = req.body;

  console.log(req.body);

  // Only include the columns that are actually in your table
  const query = `
    INSERT INTO new_inventory (
      propertyType, 
      floorsAvailable, 
      facing, 
      open, 
      totalAskingPrice, 
      twoSideOpen, 
      threeSideOpen, 
      fourSideOpen,
      builderFlooroptions, 
      bhk, 
      area, 
      areaUnit, 
      lengthUnit, 
      address, 
      ownerType, 
      name, 
      phoneNumber, 
      images,
      askingPrice, 
      propertyCondition, 
      featureType, 
      timeLimit, 
      parking, 
      swimmingPool, 
      floors, 
      toilets,
      brochure, 
      payment_schedule, 
      scanned_documents, 
      back, 
      front, 
      length, 
      contact_details, 
      apartment_dats, 
      rent_sale
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;

  // Values to be inserted into the database
  const values = [
    propertyType, 
    floorsAvailable, 
    facing, 
    open, 
    totalAskingPrice, 
    twoSideOpen, 
    threeSideOpen, 
    fourSideOpen,
    builderFlooroptions, 
    bhk, 
    area, 
    areaUnit, 
    lengthUnit, 
    address, 
    ownerType, 
    name, 
    phoneNumber, 
    JSON.stringify(images), // Assuming images are stored as JSON
    askingPrice, 
    propertyCondition, 
    featureType, 
    timeLimit, 
    parking, 
    swimmingPool, 
    floors, 
    toilets,
    brochure, 
    payment_schedule, 
    scanned_documents, 
    back, 
    front, 
    length, 
    JSON.stringify(contact_details), 
    JSON.stringify(apartment_dats), 
    rent_sale
  ];

  // Execute the query
  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Error executing query:', err);
      return res.status(500).send('Error saving inventory details');
    }

    // Insert into phonenumber table after inventory details
    const phoneQuery = `INSERT INTO phonenumber (phoneNo, name, type) VALUES (?, ?, ?)`;
    const phoneValues = [phoneNumber, name, ownerType]; // Use name, phoneNumber, and ownerType as type

    db.query(phoneQuery, phoneValues, (phoneErr, phoneResult) => {
      if (phoneErr) {
        console.error('Error inserting into phonenumber:', phoneErr);
        return res.status(500).send('Error saving owner details');
      }

      // Send the response after both inventory and owner details have been saved
      res.json({
        message: 'Inventory and owner details added successfully',
        inventoryId: result.insertId,
        phoneNumberId: phoneResult.insertId,
      });
    });
  });
});







app.post("/api/comments/add", (req, res) => {
  const { lead_id, date, comment } = req.body;

  if (!lead_id || !date || !comment) {
    return res
      .status(400)
      .json({ error: "Missing required fields: lead_id, date, or comment" });
  }

  const insertCommentQuery =
    "INSERT INTO leads_comments (lead_id, date, comment) VALUES (?, ?, ?)";

  db.query(insertCommentQuery, [lead_id, date, comment], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json({
      message: "Comment added successfully",
      comment_id: result.insertId,
    });
  });
});

app.post('/api/scheduling', (req, res) => {
  const { lead_id, purpose, date } = req.body;

  // Validate input
  if (!lead_id || !purpose || !date) {
      return res.status(400).json({ error: 'lead_id, purpose, and date are required' });
  }

  const sql = 'INSERT INTO scheduling (lead_id, date, purpose) VALUES (?, ?, ?)';
  db.query(sql, [lead_id, date, purpose], (error, results) => {
      if (error) {
          return res.status(500).json({ error: 'Database error', details: error });
      }
      res.status(201).json({ message: 'Scheduling saved', id: results.insertId });
  });
});



// Fetch comments for a specific lead
app.post("/leads/comments", (req, res) => {
    const { lead_id } = req.body; // Get lead_id from request body
    const query = "SELECT * FROM leads_comments WHERE lead_id = ?";

    db.query(query, [lead_id], (err, results) => {
        if (err) {
            return res.status(500).send(err);
        }

        if (results.length > 0) {
            return res.json(results);
        } else {
            return res.status(404).json({ message: "No comments found for this lead." });
        }
    });
});







// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
