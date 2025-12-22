const express = require("express");
const env = require("dotenv");
const path = require("path");
const cookieParser = require("cookie-parser");

const questRoutes = require("./routes/quests");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");

const app = express();

env.config();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public"),{ index: false }));

// Routes
app.use("/api", questRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

// Frontend Route
app.get("/", (req, res) => {
  const token = req.cookies.token;
  if (token) {
    res.sendFile("index.html", {root: path.join(__dirname, "public")}); 
  } else {
    res.sendFile("welcome.html", {root: path.join(__dirname, "public")});
  }
});

app.get("/gamemode1",(req,res)=>{
  const token = req.cookies.token;
  if(token){
    res.sendFile("gameMode1.html",{root: path.join(__dirname,"public")});
  } else {
    res.sendFile("welcome.html", {root: path.join(__dirname, "public")});
  }
})

app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
  console.log("Successfully!")
});