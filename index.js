const express = require("express");
const bodyParser = require("body-parser");
const logger = require("morgan");
const app = express();
const cors = require("cors");
const db = require("./queries");
const Pool = require("pg").Pool;
const schedule = require("node-schedule");
require("dotenv").config();

const rule = new schedule.RecurrenceRule();
// rule.hour = 0;
rule.minute = 0;
rule.second = 0;
rule.tz = "America/Toronto";

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: 5432,
});

const http = require("http").createServer(app);

app.use(cors());
app.use(express.json());
const API_PORT = process.env.PORT || 3003;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(logger("dev"));

app.get("/users", db.getUsers);
app.get("/tasks", db.getTasks);
app.get("/users/:id", db.getUserById);
app.post("/friends", db.getFriends);
app.post("/users", db.createUser);
app.post("/bonus", db.bonus);
app.post("/sendInvite", db.sendInvite);
app.post("/connect", db.connect);

app.get("/", (req, res) => {
  res.send("Express on Vercel, yay");
});

http.listen(API_PORT, () => {
  console.log(`LISTENING ON PORT ${API_PORT}`);
});

const { Bot, InlineKeyboard } = require("grammy");
const botToken = process.env.BOT_TOKEN;
const bot = new Bot(botToken);

bot.command("start", async (ctx) => {
  const userid = ctx.from.username; // Get the Telegram user ID
  const receiveid = ctx.match;
  let fileUrl = "";

  console.log("ctx.match ----------->", userid);

  const photos = await ctx.api.getUserProfilePhotos(ctx.from.id, { limit: 1 });

  if (photos.total_count > 0) {
    const file_id = photos.photos[0][0].file_id;

    const file = await ctx.api.getFile(file_id);
    fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;

    console.log("User's avatar URL:", fileUrl);
  } else {
    console.log("No profile photos found for this user.");
  }

  pool.query(
    "SELECT * FROM users WHERE tgid = $1",
    [userid],
    async (error, results1) => {
      if (error) {
        throw error;
      }
      let user = results1.rows[0];
      console.log("ctx.match --->", receiveid);
      console.log("user", user);

      if (!user && !receiveid) {
        pool.query(
          "INSERT INTO users (tgid, mount, friendid, avatar_url) VALUES ($1, $2, $3, $4)",
          [userid, 0, "", fileUrl]
        );
      }

      if (!user && receiveid) {
        pool.query(
          "INSERT INTO users (tgid, mount, friendid, avatar_url) VALUES ($1, $2, $3, $4)",
          [
            userid,
            ctx.from.is_premium === true ? 10000 : 5000,
            receiveid,
            fileUrl,
          ],
          async (error) => {
            if (error) throw error;

            // Now, check if the receiveid exists in the users table
            pool.query(
              "SELECT * FROM users WHERE tgid = $1",
              [receiveid],
              (error, results2) => {
                if (error) throw error;

                let sender = results2.rows[0];
                console.log("sender--->", sender);

                if (sender) {
                  // Update the sender's mount
                  const newMount =
                    Number(sender.mount) +
                    (ctx.from.is_premium === true ? 10000 : 5000);

                  pool.query(
                    "UPDATE users SET mount = $1 WHERE tgid = $2",
                    [newMount, receiveid],
                    (error) => {
                      if (error) {
                        throw error;
                      }
                      console.log("Sender's mount updated:", newMount);
                    }
                  );
                }
              }
            );
          }
        );
      }
      const menus = new InlineKeyboard().webApp(
        "Play in 1 click",
        `https://telegram-airdrop-bot-kappa.vercel.app/?user=${encodeURIComponent(
          userid
        )}`
      );

      await ctx.reply(`Hello, @${userid}! Welcome to Chirpley.`, {
        reply_markup: menus,
        parse_mode: "HTML",
      });
    }
  );
});

bot.on("callback_query:data", async (ctx) => {
  const userid = ctx.from.username; // Get the Telegram user ID
  const data = ctx.callbackQuery.data;
  switch (data) {
    case "howToEarn":
      const menus = new InlineKeyboard().webApp(
        "Play in 1 click",
        `https://telegram-airdrop-bot-kappa.vercel.app/?user=${encodeURIComponent(
          userid
        )}`
      );
      await ctx.reply(
        "How to play VWS Worlds ⚡️\n\nFull version of the guide.\n\n💰 Tap to earn\nTap the screen and collect coins.\n\n⛏ Mine\nUpgrade cards that will give you passive income.\n\n⏰ Profit per hour\nThe exchange will work for you on its own, even when you are not in the game for 3 hours.\nThen you need to log in to the game again.\n\n📈 LVL\nThe more coins you have on your balance, the higher the level of your exchange is and the faster you can earn more coins.\n\n👥 Friends\nInvite your friends and you’ll get bonuses. Help a friend move to the next leagues and you'll get even more bonuses.\n\n/help to get this guide",
        {
          reply_markup: menus,
          parse_mode: "HTML",
        }
      );
    default:
      break;
  }
});

(async () => {
  await bot.api.deleteWebhook();
  bot.start();
})();

const getLevelInfo = (count) => {
  switch (Math.floor(count / 20)) {
    case 0:
      return { text: "Bronze", number: 1 };
    case 1:
      return { text: "Silver", number: 2 };
    case 2:
      return { text: "Platinum", number: 3 };
    case 3:
      return { text: "Diamond", number: 4 };
    case 4:
      return { text: "Master", number: 5 };
    case 5:
      return { text: "Grandmaster", number: 6 };
    case 6:
      return { text: "Elite", number: 7 };
    case 7:
      return { text: "Legendary", number: 8 };
    case 8:
      return { text: "Mythic", number: 9 };
    default:
      return { text: "Mythic", number: 9 };
  }
};

schedule.scheduleJob(rule, async function () {
  console.log("start reward");
  pool.query("SELECT * FROM users ORDER BY id ASC", (error, results) => {
    if (error) throw error;
    let statements = results.rows
      .map((x) => {
        rewardPerHour = getLevelInfo(x.mount).number * 20000;
        console.log("reward->", rewardPerHour);
        return `WHEN '${x.tgid}' THEN mount + ${rewardPerHour}`;
      })
      .join(" ");
    let users = results.rows
      .map((x) => {
        rewardPerHour = getLevelInfo(x.mount).number * 20000;
        console.log("reward->", getLevelInfo(x.mount));
        return `'${x.tgid}'`;
      })
      .join(", ");
    console.log("state", statements, users);
    pool.query(
      `UPDATE users SET mount = CASE tgid ${statements} END WHERE tgid IN (${users})`,
      [],
      (error) => {
        if (error) {
          throw error;
        }
        console.log("reward updated");
      }
    );
  });
});

app.put("/users", async (req, res) => {
  const { user, mount } = req.body;

  try {
    // Check if user exists
    const userResult = await pool.query("SELECT * FROM users WHERE tgid = $1", [
      user,
    ]);

    if (userResult.rows.length === 0) {
      // User does not exist, so create a new user
      await pool.query(
        "INSERT INTO users (tgid, mount, friendid) VALUES ($1, $2, $3)",
        [user, 0, ""]
      );
      return res.status(201).json({ message: "User created successfully" });
    }

    // Update the mount value for the user
    await pool.query("UPDATE users SET mount = $1 WHERE tgid = $2", [
      mount,
      user,
    ]);

    res.status(200).json({ message: "Mount updated successfully" });
  } catch (error) {
    console.error("Failed to update mount", error);
    res.status(500).json({ error: "Failed to update mount" });
  }
});
