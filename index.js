// backend/index.js
// Learn2EarnHub — Extended backend with transactions, transfer, verify, recommendations, resume-eval, certificate export
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const app = express();
app.use(express.json());
app.use(cors());

/* ========== In-memory DB (persist to disk optionally) ========== */
const DB_FILE = "./db.json";
let DB = {
  users: {},
  sessions: {},
  wallets: {},
  courses: []
};

// Load DB if exists (so restarts keep state during hackathon)
try {
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    DB = JSON.parse(raw);
  }
} catch (e) {
  console.warn("Could not read DB file:", e.message);
}

/* Helper: persist DB (best-effort) */
function persist() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
  } catch (e) {
    /* ignore */
  }
}

/* Bootstrap courses (if not present) */
if (!DB.courses || DB.courses.length === 0) {
  DB.courses = [
    // video courses (your provided shorts)
    {
      id: "c1",
      title: "JavaScript Basics",
      platform: "Udemy",
      platformInitial: "U",
      tokenValue: 30,
      rewardAmount: 5,
      durationHours: 10,
      type: "video",
      videoUrl: "https://youtube.com/shorts/JPsJL123L8k"
    },
    {
      id: "c2",
      title: "React Essentials",
      platform: "IBM",
      platformInitial: "IBM",
      tokenValue: 75,
      rewardAmount: 15,
      durationHours: 30,
      type: "video",
      videoUrl: "https://youtube.com/shorts/LoMNmhyUkCM"
    },
    {
      id: "c3",
      title: "LeetCode 10 Problems",
      platform: "Amazon",
      platformInitial: "AZ",
      tokenValue: 95,
      rewardAmount: 20,
      durationHours: 20,
      type: "video",
      videoUrl: "https://youtube.com/shorts/Rfm8MnQzLeo"
    },

    // MCQ courses (new)
    {
      id: "c4",
      title: "Cloud Basics for Beginners",
      platform: "Google",
      platformInitial: "G",
      tokenValue: 45,
      rewardAmount: 8,
      durationHours: 1,
      type: "mcq",
      content: [
        "Cloud computing means storing and accessing data over the internet instead of your computer.",
        "Major providers include Google Cloud, AWS, Azure.",
        "Cloud helps companies scale instantly."
      ],
      mcqs: [
        {
          q: "Cloud computing means:",
          options: [
            "Storing data only in pen drive",
            "Accessing data & apps via internet",
            "Only games stored in cloud",
            "None"
          ],
          correct: 1
        },
        {
          q: "Which company provides cloud services?",
          options: ["Google", "Infosys", "Zoom", "Jio TV"],
          correct: 0
        }
      ]
    },
    {
      id: "c5",
      title: "Cybersecurity Essentials",
      platform: "Microsoft",
      platformInitial: "MS",
      tokenValue: 60,
      rewardAmount: 10,
      durationHours: 2,
      type: "mcq",
      content: [
        "Cybersecurity protects systems and data from attacks.",
        "Phishing is when attackers trick users into revealing sensitive information.",
        "Always enable Two-Factor Authentication."
      ],
      mcqs: [
        {
          q: "What is phishing?",
          options: [
            "Fishing in water",
            "Tricking users to give sensitive data",
            "Fixing internet",
            "Cleaning laptop"
          ],
          correct: 1
        },
        {
          q: "Which is a security best practice?",
          options: ["Use same password everywhere", "Disable lockscreen", "Use 2FA", "Share password with friends"],
          correct: 2
        }
      ]
    },
    {
      id: "c6",
      title: "Blockchain Fundamentals",
      platform: "Meta",
      platformInitial: "M",
      tokenValue: 80,
      rewardAmount: 12,
      durationHours: 3,
      type: "mcq",
      content: [
        "Blockchain is a distributed ledger across many computers.",
        "It is tamper-resistant and transparent.",
        "Bitcoin is the first real-world blockchain implementation."
      ],
      mcqs: [
        {
          q: "Blockchain is:",
          options: [
            "A video game",
            "A distributed ledger",
            "A bank app",
            "Chat application"
          ],
          correct: 1
        },
        {
          q: "First major blockchain:",
          options: ["Ethereum", "Google Cloud", "Bitcoin", "Amazon Prime"],
          correct: 2
        }
      ]
    }
  ];
  persist();
}

/* Basic validators */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function makeWalletAddress() {
  return "0x" + Math.random().toString(16).substring(2, 42).padEnd(40, "0").slice(0, 40);
}

/* Auth middleware */
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : h;
  if (!token || !DB.sessions[token]) return res.status(401).json({ error: "unauthorized" });
  req.email = DB.sessions[token];
  next();
}

/* Create transaction ledger if missing */
if (!DB.transactions) DB.transactions = []; // { from, to, amount, type, memo, timestamp }

/* ===== register ===== */
app.post("/api/register", (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email & password required" });
  if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: "invalid email format" });
  if (DB.users[email]) return res.status(400).json({ error: "user exists, please login" });

  const walletAddress = makeWalletAddress();
  DB.users[email] = { email, password, displayName: (displayName && displayName.trim()) ? displayName.trim() : email.split("@")[0], walletAddress };
  DB.wallets[walletAddress] = { walletAddress, balance: 0, tokens: [], resumeValue: 0 };

  const token = "token-" + Math.random().toString(36).substring(2);
  DB.sessions[token] = email;

  DB.transactions.push({ from: "SYSTEM", to: walletAddress, amount: 0, type: "register", memo: `account created for ${email}`, timestamp: Date.now() });
  persist();
  res.json({ token, displayName: DB.users[email].displayName });
});

/* ===== login ===== */
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email & password required" });
  if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: "invalid email format" });

  const user = DB.users[email];
  if (!user || user.password !== password) return res })
