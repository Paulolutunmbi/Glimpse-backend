const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const users = [];
dotenv.config();

app.use(cors());
app.use(express.json());

const port = process.env.PORT 
const URI = process.env.MONGO_URI;
mongoose.connect(URI)
.then(() => {
    console.log('Connected to MongoDB');
})
.catch((err) => {
    console.log('Error connecting to MongoDB', err);
});


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});