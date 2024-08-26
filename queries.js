const Pool = require("pg").Pool;
const { addHours } = require("date-fns");
require("dotenv").config();
const { Keys } = require("casper-js-sdk");
const { request, response } = require("express");
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: 5432,
});

const getUsers = (request, response) => {
  pool.query("SELECT * FROM users ORDER BY id ASC", (error, results) => {
    if (error) {
      throw error;
    }
    response.status(200).json(results.rows);
  });
};

const getTasks = (request, response) => {
  pool.query("SELECT * FROM tasks ORDER BY id ASC", (error, results) => {
    if (error) {
      throw error;
    }
    response.status(200).json(results.rows);
  });
};

const getUserById = (request, response) => {
  const id = parseInt(request.params.id);

  pool.query("SELECT * FROM users WHERE id = $1", [id], (error, results) => {
    if (error) {
      throw error;
    }
    response.status(200).json(results.rows);
  });
};

const getFriends = (request, response) => {
  const { user } = request.body;
  pool.query(
    "SELECT * FROM users WHERE friendid = $1",
    [user],
    (error, results) => {
      if (error) {
        throw error;
      }
      if (results.rows.length === 0)
        return response.json({ stats: "no friend found" });
      else return response.json({ stats: "success", items: results.rows });
    }
  );
};

const getBonusLevel = (request, response) => {
  pool.query("SELECT * FROM bonuslevel", (error, result) => {
    if (error) {
      throw error;
    }
    response.status(200).json(result.rows);
  });
};

const getBonusLevelById = (request, response) => {
  const id = parseInt(request.params.id);

  pool.query("SELECT friend_value, premium_value FROM bonuslevel WHERE level_id = $1", [id], (error, results) => {
    if (error) {
      throw error;
    }
    response.status(200).json(results.rows);
  });
}

const createUser = (request, response) => {
  const { user } = request.body;
  pool.query(
    "SELECT * FROM users WHERE tgid = $1",
    [user],
    (error, results) => {
      if (error) {
        throw error;
      }
      if (results.rows.length === 0) {
        pool.query(
          "INSERT INTO users (tgid, mount, friendid) VALUES ($1, $2, $3)",
          [user, 0, ""],
          (error, results) => {
            if (error) {
              throw error;
            }
            response.status(200).json({ user });
          }
        );
      } else {
        response.status(200).json({ user });
      }
    }
  );
};

const bonus = (request, response) => {
  const { user, title, price } = request.body;
  const currentDateTime = new Date();
  // const recentSocials = await Social.find({
  //   tgid: id,
  //   title: title,
  //   s_date: { $gte: addHours(currentDateTime, -24) }, // Check if the s_date is within the last 24 hours
  // });
  // if (recentSocials.length > 0) return response.json({ stats: "error", message: "You need more time" });

  pool.query(
    `SELECT * FROM socials WHERE tgid = $1 AND title = $2 AND date >= CURRENT_TIMESTAMP - INTERVAL '24 hours'`,
    [user, title],
    (error, socialResults) => {
      if (error) throw error;
      if (socialResults.rows.length > 0)
        return response.json({ stats: "error", message: "You need more time" });
      pool.query(
        "SELECT * FROM users WHERE tgid = $1",
        [user],
        (error, results) => {
          if (error) throw error;
          pool.query(
            "UPDATE users SET mount = $1 WHERE tgid = $2",
            [Number(results.rows[0].mount) + Number(price), user],
            (error) => {
              if (error) {
                throw error;
              }
              pool.query(
                "INSERT INTO socials (tgid, title, date) VALUES ($1, $2, $3)",
                [user, title, currentDateTime],
                (error, results1) => {
                  if (error) {
                    throw error;
                  }
                  return response.json({
                    stats: "success",
                    mount: Number(results.rows[0].mount) + Number(price),
                  });
                }
              );
            }
          );
        }
      );
    }
  );
};

const sendInvite = async (request, response) => {
  const { inviteLink, user } = request.body;

  if (!inviteLink || !user) {
    return response.status(400).json({ error: "Missing invite link or user" });
  }

  try {
    inviteData = { user };
    return response.status(200).json({ stats: "ok" });
  } catch (error) {
    console.error("Error sending invite link:", error);
    response.status(500).json({ error: "Failed to send invite link" });
  }
};

const connect = async (request, response) => {
  const { user } = request.body;
  pool.query(
    "SELECT * FROM users WHERE tgid = $1",
    [user],
    (error, results) => {
      if (error) {
        throw error;
      }
      if (results.rows.length > 0) {
        if (!results.rows[0]?.publickey || !results.rows[0]?.privatekey) {
          const keypair = Keys.Ed25519.new();
          const _privateKey = keypair.exportPrivateKeyInPem();

          pool.query(
            "UPDATE users SET publickey = $1, privatekey = $2 WHERE tgid = $3",
            [keypair.accountHex(), _privateKey, user],
            (error) => {
              if (error) {
                throw error;
              }
              return response.json({
                publicKey: keypair.accountHex(),
                privateKey: _privateKey,
              });
            }
          );
        } else
          return response.json({
            publicKey: results.rows[0].publickey,
            privateKey: results.rows[0].privatekey,
          });
      }
    }
  );
};

const updateUser = async (request, response) => {
  const { user, mount } = request.body;

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
      return response.status(201).json({ message: "User created successfully" });
    }

    // Update the mount value for the user
    await pool.query("UPDATE users SET mount = $1 WHERE tgid = $2", [
      mount,
      user,
    ]);

    response.status(200).json({ message: "Mount updated successfully" });
  } catch (error) {
    console.error("Failed to update mount", error);
    response.status(500).json({ error: "Failed to update mount" });
  }
}

const checkRaffleStatus = (req, res) => {
  const { userId } = req.query;
  pool.query(
    'SELECT * FROM raffle_history WHERE user_id = $1',
    [userId],
    (error, results) => {
      if (error) {
        throw error;
      }
      const data = results.rows[0];
      if (data) {
        const lastDrawTime = new Date(data.last_draw);
        const now = new Date();
        const timeDifference = (now - lastDrawTime) / (1000 * 60 * 60); // Time difference in hours
        const freeDrawsLeft = timeDifference >= 24 ? 3 : 3 - data.draw_count;
        res.json({
          freeDrawsLeft: freeDrawsLeft > 0 ? freeDrawsLeft : 0,
          nextFreeDrawTime: timeDifference >= 24 ? 0 : 24 - timeDifference,
        });
      } else {
        // No entry in raffle_history means the user is new
        res.json({
          freeDrawsLeft: 3,
          nextFreeDrawTime: 0,
        });
      }
    }
  );
};

// Perform a raffle draw
const performRaffleDraw = (req, res) => {
  const { userId, useCoins } = req.body;

  // Check user's raffle history
  pool.query(
    'SELECT * FROM raffle_history WHERE user_id = $1',
    [userId],
    (error, results) => {
      if (error) {
        throw error;
      }
      const data = results.rows[0];
      let drawCount = data ? data.draw_count : 0;
      let lastDrawTime = data ? new Date(data.last_draw) : null;
      const now = new Date();

      if (data && ((now - lastDrawTime) / (1000 * 60 * 60) < 24 && drawCount >= 3)) {
        if (!useCoins) {
          // User has used all free draws for the day
          res.status(403).json({ message: "No free draws left" });
          return;
        }
        // Deduct coins logic here
      } else {
        // User can draw
        if (data) {
          if ((now - lastDrawTime) / (1000 * 60 * 60) >= 24) {
            // Reset draw count after 24 hours
            drawCount = 0;
          }
          pool.query(
            'UPDATE raffle_history SET draw_count = $1, last_draw = $2 WHERE user_id = $3',
            [drawCount + 1, now, userId]
          );
        } else {
          pool.query(
            'INSERT INTO raffle_history (user_id, draw_count, last_draw) VALUES ($1, $2, $3)',
            [userId, 1, now]
          );
        }
      }

      // Determine raffle result
      const raffleResult = Math.floor(Math.random() * 100) + 1; // Random result between 1 and 100
      let coinsWon = raffleResult <= 33 ? 100 : raffleResult <= 66 ? 500 : 1000; // Example logic

      // Update user's coins
      pool.query(
        'UPDATE users SET mount = mount + $1 WHERE id = $2',
        [coinsWon, userId]
      );

      res.json({ result: coinsWon });
    }
  );
};

module.exports = {
  getUsers,
  getTasks,
  getUserById,
  getFriends,
  getBonusLevel,
  getBonusLevelById,
  createUser,
  bonus,
  sendInvite,
  connect,
  updateUser,
  checkRaffleStatus,
  performRaffleDraw
};
