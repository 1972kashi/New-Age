const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const DB_FILE = path.join(__dirname, 'db.json');
const PORT = process.env.PORT || 3000;

function readDB(){
  try{
    const raw = fs.readFileSync(DB_FILE,'utf8');
    const data = JSON.parse(raw);
    return {
      cars: Array.isArray(data.cars) ? data.cars : [],
      carDetails: Array.isArray(data.carDetails) ? data.carDetails : [],
      ...data
    };
  }catch(e){
    return { cars: [], carDetails: [] };
  }
}

function writeDB(data){
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function createRecord(db, table, item){
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  const now = new Date().toISOString();
  const record = Object.assign({ id, createdAt: now }, item);
  db[table].push(record);
  return record;
}

const app = express();
app.use(cors());
app.use(express.json({limit: '2mb'}));

// serve static app files from the project root
app.use(express.static(path.join(__dirname)));

// serve uploads (if you later add file uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create car(s) - accepts JSON body for a single car or an array
app.post('/api/cars', (req, res) => {
  const body = req.body;
  if(!body) return res.status(400).json({ error: 'Missing body' });
  const db = readDB();
  const items = Array.isArray(body) ? body : [body];
  const created = items.map(item => {
    const car = createRecord(db, 'cars', Object.assign({
      name: '', miles:'', trans:'', fuel:'', year:'', price:'', link:'car-detail.html', img:'', badge:false
    }, item));
    if (!car.link || car.link === 'car-detail.html') {
      car.link = `car-detail.html?id=${car.id}`;
    }
    return car;
  });
  writeDB(db);
  res.status(201).json(created.length === 1 ? created[0] : created);
});

// List cars with pagination
app.get('/api/cars', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 50);
  const db = readDB();
  const items = db.cars.slice().reverse(); // newest first
  const total = items.length;
  const start = (page -1) * limit;
  const paged = items.slice(start, start + limit);
  res.json({ total, page, limit, items: paged });
});

// Single car
app.get('/api/cars/:id', (req, res) => {
  const db = readDB();
  const car = db.cars.find(c => c.id === req.params.id);
  if(!car) return res.status(404).json({ error: 'Not found' });
  res.json(car);
});

// Update a single car
app.put('/api/cars/:id', (req, res) => {
  const db = readDB();
  const carIndex = db.cars.findIndex(c => c.id === req.params.id);
  if (carIndex === -1) return res.status(404).json({ error: 'Not found' });
  const update = req.body;
  if (!update || typeof update !== 'object') {
    return res.status(400).json({ error: 'Invalid body' });
  }

  db.cars[carIndex] = Object.assign({}, db.cars[carIndex], update, { id: db.cars[carIndex].id });
  writeDB(db);
  res.json(db.cars[carIndex]);
});

// Delete a single car
app.delete('/api/cars/:id', (req, res) => {
  const db = readDB();
  const carIndex = db.cars.findIndex(c => c.id === req.params.id);
  if (carIndex === -1) return res.status(404).json({ error: 'Not found' });

  const deleted = db.cars.splice(carIndex, 1)[0];
  writeDB(db);
  res.json({ deleted });
});

// Car detail records saved separately for full detail pages
app.get('/api/car-details', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 50);
  const db = readDB();
  const items = db.carDetails.slice().reverse();
  const total = items.length;
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit);
  res.json({ total, page, limit, items: paged });
});

app.get('/api/car-details/:id', (req, res) => {
  const db = readDB();
  const car = db.carDetails.find(c => c.id === req.params.id);
  if (!car) return res.status(404).json({ error: 'Not found' });
  res.json(car);
});

app.post('/api/car-details', (req, res) => {
  const body = req.body;
  if (!body) return res.status(400).json({ error: 'Missing body' });
  const db = readDB();
  const created = createRecord(db, 'carDetails', Object.assign({
    name: '', miles:'', trans:'', fuel:'', year:'', price:'', img:'', badge:false,
    model:'', engine:'', bodyType:'', condition:'', drive:'', location:'', description:''
  }, body));
  writeDB(db);
  res.status(201).json(created);
});

app.put('/api/car-details/:id', (req, res) => {
  const db = readDB();
  const detailIndex = db.carDetails.findIndex(c => c.id === req.params.id);
  if (detailIndex === -1) return res.status(404).json({ error: 'Not found' });
  db.carDetails[detailIndex] = Object.assign({}, db.carDetails[detailIndex], req.body, { id: db.carDetails[detailIndex].id });
  writeDB(db);
  res.json(db.carDetails[detailIndex]);
});

app.delete('/api/car-details/:id', (req, res) => {
  const db = readDB();
  const detailIndex = db.carDetails.findIndex(c => c.id === req.params.id);
  if (detailIndex === -1) return res.status(404).json({ error: 'Not found' });
  const deleted = db.carDetails.splice(detailIndex, 1)[0];
  writeDB(db);
  res.json({ deleted });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
