const express = require("express");
const env = require("dotenv");
const path = require("path");
const cookieParser = require("cookie-parser");

env.config();

const questRoutes = require("./routes/quests");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const friendsRoutes = require("./routes/friends")

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const requireAuth = (req,res,next) =>{
  const token = req.cookies.token;

  if(!token){
    return res.redirect("/login");
  }
  next();
}

const hasAuth = (req,res,next) =>{
  const token = req.cookies.token;
  if(token){
    return res.redirect("/");
  }
  next();
}

// Routes
app.use("/api", questRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/friends",friendsRoutes);

// Frontend Route
app.get("/", (req, res) => {
  const token = req.cookies.token;
  if (token) {
    res.sendFile("index.html", {root: path.join(__dirname, "loggingIn")}); 
  } else {
    res.sendFile("login.html", {root: path.join(__dirname, "views")});
  }
});

app.get("/login",hasAuth,(req,res)=>{
  res.sendFile("login.html", {root: path.join(__dirname,"views")});
})

app.get("/index",requireAuth,(req,res)=>{
  res.sendFile("index.html", {root: path.join(__dirname,"loggingIn")});
})

app.get("/gamemode1",requireAuth,(req,res)=>{
  res.sendFile("gameMode1.html", {root: path.join(__dirname,"loggingIn")})
})

app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
  console.log("Successfully!")
});