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

  pool.query(
    "SELECT friend_value, premium_value FROM bonuslevel WHERE level_id = $1",
    [id],
    (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).json(results.rows);
    }
  );
};

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
      return response
        .status(201)
        .json({ message: "User created successfully" });
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
};

const getRaffleInfo = (request, response) => {
  const { userId } = request.body;
  pool.query(
    "SELECT * FROM raffles WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
    [userId],
    (error, results) => {
      if (error) {
        throw error;
      }
      if (results.rows.length === 0)
        return response.json({ stats: "no found user" });
      else return response.json({ stats: "success", items: results.rows });
    }
  );
};

const getRank = (request, response) => {
  const { user } = request.body;
  pool.query(
    `SELECT rank FROM (
    SELECT tgid, DENSE_RANK() OVER (ORDER BY mount DESC) AS rank
    FROM users
  ) AS ranked_users WHERE tgid = $1`,
    [user],
    (error, results) => {
      if (error) {
        throw error;
      }
      if (results.rows.length > 0) {
        response.status(200).json(results.rows[0].rank);
      } else {
        response.status(404).json({ error: "User not found" });
      }
    }
  );
};

const getFriendsnumber = (request, response) => {
  const { user } = request.body;
  pool.query(
    "SELECT id FROM users WHERE friendid = $1",
    [user],
    (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).json(results.rows.length);
    }
  );
};

const getStoreItems = (req, res) => {
  const { user, storeId } = req.body;
  const query = `
   SELECT 
        si.id AS item_id,
        si.name AS item_name,
        s.name AS store_name, 
        si.image_path,
        si.purchase_amount[COALESCE(usi.product_level, 1)] AS purchase_amount, 
        si.payment_amount[COALESCE(usi.product_level, 1)] AS payment_amount, 
        si.required_user_level,
        COALESCE(usi.product_level, 1) AS product_level,
        usi.purchase_date
    FROM 
        store_items si
    LEFT JOIN 
        user_store_items usi ON si.id = usi.item_id AND usi.user_id = (
            SELECT id FROM users WHERE tgid = $1 
        ) 
    JOIN 
        stores s ON si.store_id = s.id
    WHERE 
        s.id = $2
    ORDER BY 
        si.id;
  `;
  pool.query(query, [user, storeId], (error, results) => {
    if (error) {
      throw error;
    }
    res.status(200).json(results.rows);
  });
};

const updateProfit = async (req, res) => {
  const { user, amount, price, itemId } = req.body;

  try {
    const data = await pool.query("SELECT * FROM users WHERE tgid = $1", [
      user,
    ]);

    const userResult = data.rows[0];
    const userId = userResult.id;

    if (!userResult)
      return res.status(404).json({ stats: false, message: "User not found" });

    if (Number(userResult.mount) < Number(price))
      return res
        .status(200)
        .json({ stats: false, message: "There are not enough coins." });

    await pool.query(
      "UPDATE users SET profit = profit + $1, mount = mount - $2 WHERE tgid = $3",
      [amount, price, user]
    );
    const updatedata = await pool.query("SELECT * FROM users WHERE tgid = $1", [
      user,
    ]);
    let currentmount = updatedata.rows[0].mount;

    const checkQuery = `
      SELECT * FROM user_store_items 
      WHERE user_id = $1 AND item_id = $2
    `;
    const { rows } = await pool.query(checkQuery, [userId, itemId]);

    if (rows.length > 0) {
      const updateQuery = `
        UPDATE user_store_items 
        SET product_level = product_level + 1, purchase_date = CURRENT_TIMESTAMP 
        WHERE user_id = $1 AND item_id = $2
      `;
      await pool.query(updateQuery, [userId, itemId]);
    } else {
      const insertQuery = `
        INSERT INTO user_store_items (user_id, item_id, product_level, purchase_date) 
        VALUES ($1, $2, 2, CURRENT_TIMESTAMP)
      `;
      await pool.query(insertQuery, [userId, itemId]);
    }

    res.json({
      stats: true,
      message: "profit has been successfully updated.",
      updatemount: currentmount,
    });
  } catch (err) {
    console.error("Failed to update mount", err);
    res.status(500).json({ error: "Failed to update profit" });
  }
};

const getLeaderboard = (request, response) => {
  pool.query("SELECT * FROM users ORDER BY mount DESC LIMIT 10", (error, results) => {
    if(error) {
      throw error;
    }
    response.status(200).json(results.rows)
  })
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
  getRaffleInfo,
  getRank,
  getFriendsnumber,
  getStoreItems,
  updateProfit,
  getLeaderboard,
};
