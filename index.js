const express = require("express");
const bodyParser = require("body-parser");
const logger = require("morgan");
const app = express();
const cors = require("cors");
const db = require("./queries");
const Pool = require("pg").Pool;
const schedule = require("node-schedule");
const cron = require("node-cron");
require("dotenv").config();

const rule = new schedule.RecurrenceRule();
rule.hour = 0;
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
app.get("/bonusLevel", db.getBonusLevel);
app.get("/bonusLevel/:id", db.getBonusLevelById);
app.post("/friends", db.getFriends);
app.post("/users", db.createUser);
app.post("/bonus", db.bonus);
app.post("/sendInvite", db.sendInvite);
app.post("/connect", db.connect);
app.put("/users", db.updateUser);
app.post("/raffleinfo", db.getRaffleInfo);
app.post("/globalrank", db.getRank);
app.post("/friendsnumber", db.getFriendsnumber);
app.post("/storeitems", db.getStoreItems);
app.post("/profit", db.updateProfit);
app.get("/leaderboard", db.getLeaderboard);

app.get("/", (req, res) => {
  res.send("Express on Vercel, yay");
});

http.listen(API_PORT, () => {
  console.log(`LISTENING ON PORT ${API_PORT}`);
});

const { Bot, InlineKeyboard } = require("grammy");
const botToken = process.env.BOT_TOKEN;
const bot = new Bot(botToken);

const getLevelInfo = (count) => {
  switch (Math.floor(count / 20)) {
    case 0:
      return {
        text: "Rookie",
        number: 1,
        image: "/images/lvl-1-rookie.png",
        lvlcoin: 20,
      };
    case 1:
      return {
        text: "Bronze",
        number: 2,
        image: "/images/lvl-2-bronze.png",
        lvlcoin: 20,
      };
    case 2:
      return {
        text: "Silver",
        number: 3,
        image: "/images/lvl-3-silver.png",
        lvlcoin: 20,
      };
    case 3:
      return {
        text: "Gold",
        number: 4,
        image: "/images/lvl-4-gold.png",
        lvlcoin: 20,
      };
    case 4:
      return {
        text: "Platinum",
        number: 5,
        image: "/images/lvl-5-platinum.png",
        lvlcoin: 20,
      };
    case 5:
      return {
        text: "Diamond",
        number: 6,
        image: "/images/lvl-6-diamond.png",
        lvlcoin: 20,
      };
    case 6:
      return {
        text: "Master",
        number: 7,
        image: "/images/lvl-7-master.png",
        lvlcoin: 20,
      };
    case 7:
      return {
        text: "Grand Master",
        number: 8,
        image: "/images/lvl-8-grand-master.png",
        lvlcoin: 20,
      };
    case 8:
      return {
        text: "Lord",
        number: 9,
        image: "/images/lvl-9-lord.png",
        lvlcoin: 20,
      };
    default:
      return {
        text: "Legendary",
        number: 10,
        image: "/images/lvl-10-legendary.png",
        lvlcoin: 20,
      };
  }
};

bot.command("start", async (ctx) => {
  const userid = ctx.from.username; // Get the Telegram user ID
  const receiveid = ctx.match;
  let fileUrl = "";

  const photos = await ctx.api.getUserProfilePhotos(ctx.from.id, { limit: 1 });

  if (photos.total_count > 0) {
    const file_id = photos.photos[0][0].file_id;

    const file = await ctx.api.getFile(file_id);
    fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
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

      if (!user && !receiveid) {
        pool.query(
          "INSERT INTO users (tgid, mount, friendid, avatar_url) VALUES ($1, $2, $3, $4)",
          [userid, 0, "", fileUrl]
        );
      }

      if (!user && receiveid) {
        pool.query(
          "SELECT * FROM users WHERE tgid = $1",
          [receiveid],
          (error, results) => {
            if (error) throw error;

            let sender = results.rows[0];

            // Determine the levelInfo based on the sender's current mount
            const levelInfo = getLevelInfo(sender ? sender.mount : 0);

            // Query the bonuslevel table to get the stand and premium values for this level
            pool.query(
              "SELECT friend_value, premium_value FROM bonuslevel WHERE level_name = $1",
              [levelInfo.text],
              (error, results3) => {
                if (error) throw error;

                const { friend_value, premium_value } = results3.rows[0];

                // Insert the new user with the correct initial mount value
                pool.query(
                  "INSERT INTO users (tgid, mount, friendid, avatar_url) VALUES ($1, $2, $3, $4)",
                  [
                    userid,
                    ctx.from.is_premium === true ? premium_value : friend_value,
                    receiveid,
                    fileUrl,
                  ],
                  (error) => {
                    if (error) throw error;

                    // Now, update the sender's mount value based on their level
                    if (sender) {
                      const newMount =
                        Number(sender.mount) +
                        (ctx.from.is_premium === true
                          ? premium_value
                          : friend_value);

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
        );
      }

      const menus = new InlineKeyboard().webApp(
        "Play in 1 click",
        `https://telegram-airdrop-bot-kappa.vercel.app/?user=${encodeURIComponent(
          userid
        )}`
      );

      await ctx.reply(`Hello, @${userid}! Welcome to Airdrop.`, {
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

app.use(express.json());

async function updateUserMount(user) {
  const { id, tgid } = user;

  let currentInterval;

  const updateMount = async () => {
    try {
      const { rows } = await pool.query("SELECT profit FROM users WHERE id = $1", [id]);
      const profit = rows[0].profit;

      if (profit > 0) {
        const intervalTime = (3600 / profit) * 1000;

        if (currentInterval) {
          clearInterval(currentInterval);
        }

        currentInterval = setInterval(async () => {
          try {
            const result = await pool.query(
              "UPDATE users SET mount = mount + 1 WHERE id = $1 RETURNING mount",
              [id]
            );

            console.log(`Updated mount for user ${tgid}: ${result.rows[0].mount}`);
          } catch (error) {
            console.error(`Error updating mount for user ${tgid}:`, error);
          }
        }, intervalTime);
      } else {
        console.log(`Skipping updates for user ${tgid} due to zero profit.`);
        if (currentInterval) {
          clearInterval(currentInterval);
        }
      }
    } catch (error) {
      console.error(`Error fetching profit for user ${tgid}:`, error);
    }
  };

  await updateMount();

  setInterval(updateMount, 1000);
}

async function startUpdatingMounts() {
  try {
    const users = await pool.query("SELECT id, tgid, profit FROM users");

    users.rows.forEach((user) => {
      updateUserMount(user);
    });
  } catch (error) {
    console.error("Error fetching users:", error);
  }
}

startUpdatingMounts();

app.post("/raffle", async (req, res) => {
  const { userId, useCoins } = req.body;

  try {
    const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    const user = userQuery.rows[0];

    if (!user) return res.status(404).json({ message: "User not found" });

    const raffleQuery = await pool.query(
      "SELECT * FROM raffles WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
      [userId]
    );
    let raffle = raffleQuery.rows.length > 0 ? raffleQuery.rows[0] : null;
    let nowmount = Number(user.mount);

    const now = new Date();
    const lastDraw =
      raffle && raffle.draw_count > 2 ? new Date(raffle.last_draw) : now;
    const hoursSinceLastDraw = Math.abs(now - lastDraw) / 36e5;

    if (raffle && hoursSinceLastDraw < 24 && raffle.draw_count >= 3) {
      if (useCoins && user.mount >= 10000) {
        await pool.query(
          "UPDATE users SET mount = mount - 10000 WHERE id = $1",
          [userId]
        );
        const newRaffleQuery = await pool.query(
          "INSERT INTO raffles (user_id, draw_count, last_draw) VALUES ($1, $2, $3) RETURNING *",
          [userId, 0, now]
        );
        raffle = newRaffleQuery.rows[0];
        nowmount -= Number(10000);
        return res.status(200).json({
          message: "Run the raffle.",
          updatemount: nowmount,
        });
      } else {
        return res.status(200).json({
          message: "No more draws available today or insufficient coins",
          updatemount: nowmount,
        });
      }
    } else if (!raffle || hoursSinceLastDraw >= 24) {
      const newRaffleQuery = await pool.query(
        "INSERT INTO raffles (user_id, draw_count, last_draw) VALUES ($1, $2, $3) RETURNING *",
        [userId, 0, now]
      );
      raffle = newRaffleQuery.rows[0];
    } else if (useCoins) {
      return res.status(200).json({
        message: "There are still free draws left.",
        updatemount: nowmount,
      });
    }

    const rewardAmount = Math.floor(Math.random() * 1000);
    await pool.query(
      "INSERT INTO raffle_rewards (raffle_id, reward_amount) VALUES ($1, $2)",
      [raffle.id, rewardAmount]
    );

    await pool.query(
      "UPDATE raffles SET draw_count = draw_count + 1, last_draw = $1 WHERE id = $2",
      [now, raffle.id]
    );
    await pool.query("UPDATE users SET mount = mount + $1 WHERE id = $2", [
      rewardAmount,
      userId,
    ]);

    nowmount += Number(rewardAmount);
    res.json({ reward: rewardAmount, updatemount: nowmount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});
