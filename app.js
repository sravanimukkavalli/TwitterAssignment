const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDbAndServer()

const returnFollowingUserIds = async username => {
  const getUsersQuery = `
  SELECT follower.following_user_id
  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
  WHERE user.username='${username}'
  `
  const usersObj = await db.all(getUsersQuery)
  const ids = usersObj.map(each => each.following_user_id)
  return ids
}

const authenticateJwtToken = (request, response, next) => {
  const authHeader = request.headers['authorization']
  let jwtToken
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_TOKEN', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const userQuery = `
    SELECT *
    FROM user
    WHERE username='${username}'
    `
  const dbUser = await db.get(userQuery)
  if (dbUser === undefined) {
    const isPsdLength = password.length >= 6
    if (isPsdLength) {
      const hashedPsd = await bcrypt.hash(password, 10)
      const addUserQuery = `
            INSERT INTO 
                user(name,username,password,gender)
            VALUES(
              '${name}','${username}','${hashedPsd}','${gender}'
            )
            `
      await db.run(addUserQuery)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const userQuery = `
    SELECT *
    FROM user
    WHERE username='${username}'
    `
  const dbUser = await db.get(userQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPsdSame = await bcrypt.compare(password, dbUser.password)
    if (isPsdSame) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get(
  '/user/tweets/feed/',
  authenticateJwtToken,
  async (request, response) => {
    const {username} = request
    const followingIds = await returnFollowingUserIds(username)
    const getLatestTweets = `
    SELECT user.username AS username,
          tweet.tweet AS tweet,
          tweet.date_time AS dateTime
    FROM tweet INNER JOIN user ON user.user_id=tweet.user_id
    WHERE user.user_id IN (${followingIds})
    ORDER BY tweet.date_time DESC
    LIMIT 4;
    `
    // const getLatestTweets = `
    //     SELECT user.username AS username,
    //       tweet.tweet AS tweet,
    //       tweet.date_time AS dateTime
    //     FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
    //     INNER JOIN tweet ON user.user_id = tweet.user_id
    //     WHERE user.username= '${username}'
    //     ORDER BY tweet.date_time DESC
    //     LIMIT 4 OFFSET 0
    //     `
    const latestTweetsObj = await db.all(getLatestTweets)
    response.send(latestTweetsObj)
  },
)

app.get('/user/following/', authenticateJwtToken, async (request, response) => {
  const {username} = request
  const followingIds = await returnFollowingUserIds(username)
  const getFollowingNames = `
  SELECT user.name as name
  FROM user
  WHERE user_id IN (${followingIds})
  `
  // const getUserFollowingNames = `
  // SELECT follower.following_user_id
  // FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
  // WHERE user.username ='${username}'
  // `
  // const followingNames = await db.all(getUserFollowingNames)
  // const ids = followingNames.map(each => each.following_user_id)
  // const getNamesQUERY = `
  // SELECT user.username
  // FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
  // WHERE follower.following_user_id IN (${ids})
  // `
  const getNames = await db.all(getFollowingNames)
  response.send(getNames)
})

app.get('/user/followers/', authenticateJwtToken, async (request, response) => {
  const {username} = request
  const getFollowersNamesIds = `
  SELECT follower.follower_user_id
  FROM user INNER JOIN follower on user.user_id=follower.following_user_id
  WHERE user.username='${username}'
  `
  const ids = await db.all(getFollowersNamesIds)
  const followerIds = ids.map(each => each.follower_user_id)
  const getFollowersQuery = `
  SELECT user.name as name
  FROM user
  WHERE user_id IN (${followerIds})
  `
  const followers = await db.all(getFollowersQuery)
  response.send(followers)
  // const getUserFollowingNames = `
  // SELECT DISTINCT follower.follower_user_id
  // FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
  // WHERE user.username='${username}'
  // `
  // const followingNames = await db.all(getUserFollowingNames)
  // const ids = followingNames.map(each => each.follower_user_id)
  // const getNamesQUERY = `
  // SELECT user.username
  // FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
  // WHERE follower.follower_user_id IN (${ids})
  // `
  // const getNames = await db.all(getNamesQUERY)
  // response.send(getNames)
})

app.get(
  '/tweets/:tweetId/',
  authenticateJwtToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const followingIds = await returnFollowingUserIds(username)
    const userRelatedTweetsQuery = `
    SELECT tweet.tweet_id
      FROM tweet INNER JOIN user ON user.user_id = tweet.user_id
      WHERE user.user_id IN (${followingIds})
      AND tweet.tweet_id = ${tweetId}
    `
    const userRelatedTweetsObj = await db.get(userRelatedTweetsQuery)
    if (userRelatedTweetsObj !== undefined) {
      const getTweet = `
      SELECT tweet.tweet AS tweet,
        COUNT(DISTINCT like.like_id) AS likes,
        COUNT(DISTINCT reply.reply_id) AS replies,
        tweet.date_time AS dateTime
      FROM tweet LEFT JOIN reply ON tweet.tweet_id =reply.tweet_id 
        INNER JOIN like ON tweet.tweet_id=like.tweet_id
      WHERE tweet.tweet_id=${tweetId}
      `
      const tweetObj = await db.get(getTweet)
      response.send(tweetObj)
    } else {
      response.status(401)
      response.send('Invalid Request')
    }

    // const getAllFollowingUsers = `
    //   SELECT follower.following_user_id AS followingUserId
    //   FROM user INNER JOIN follower ON user.user_id=follower.follower_used_id
    //   WHERE user.username='${username}'
    //   `
    // const allFollowingUsersObj = await db.all(getAllFollowingUsers)
    // const allFollowingUsers = allFollowingUsersObj.map(
    //   each => each.followingUserId,
    // )
    // console.log(allFollowingUsers)
    // if (allFollowingUsers) {
    //   const userRequestedTweetQuery = `
    //   SELECT tweet.tweet AS tweet,
    //     COUNT(like.like_id) AS likes,
    //     COUNT(reply.reply_id) AS replies,
    //     tweet.date_time AS dateTime
    //   FROM tweet INNER JOIN like ON tweet.tweet_id= like.tweet_id
    //   INNER JOIN reply ON like.tweet_id = reply.tweet_id
    // WHERE tweet_id=${tweetId}
    //   `
    //   const tweets = await db.get(userRequestedTweetQuery)
    //   response.send(tweets)
    // } else {
    //   response.status(401)
    //   response.send('Invalid Request')
    // }
  },
)

app.get(
  '/tweets/:tweetId/likes/',
  authenticateJwtToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const followingIds = await returnFollowingUserIds(username)
    const userRelatedTweetsQuery = `
    SELECT tweet.tweet_id
      FROM tweet INNER JOIN user ON user.user_id = tweet.user_id
      WHERE user.user_id IN (${followingIds})
      AND tweet.tweet_id = ${tweetId}
    `
    const userRelatedTweetsObj = await db.get(userRelatedTweetsQuery)
    if (userRelatedTweetsObj !== undefined) {
      //   const likeTweetsQuery = `
      //   SELECT user.name AS name
      //   FROM user INNER JOIN like ON user.user_id=like.user_id
      //   WHERE like.tweet_id = ${tweetId}
      // `
      const likeTweetsQuery = `
      SELECT user.username AS username
      FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
        INNER JOIN user ON like.user_id = user.user_id
      WHERE tweet.tweet_id = ${tweetId}
      `
      const dbResponse = await db.all(likeTweetsQuery)
      const names = dbResponse.map(each => each.username)
      response.send({likes: names})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
    // const getAllFollowingUsers = `
    // SELECT follower.following_user_id AS followingUserId
    // FROM user INNER JOIN follower ON user.user_id=follower.follower_used_id
    // WHERE user.username='${username}'
    // `
    // const allFollowingUsersObj = await db.all(getAllFollowingUsers)
    // const allFollowingUsers = []
    // allFollowingUsersObj.map(each =>
    //   allFollowingUsers.push(each.followingUserId),
    // )
    // if (allFollowingUsers.includes(tweetId)) {
    //   const tweetOfFollowingUser = `
    //       SELECT user.username AS username
    //       FROM user INNER JOIN like ON user.user_id=like.user_id
    //       WHERE like.tweet_id =${tweetId}
    // `
    //   const likedNamesObj = await db.all(tweetOfFollowingUser)
    //   const likedNames = likedNamesObj.map(each => each.username)
    //   response.send({likes: likedNames})
    // } else {
    //   response.status(401)
    //   response.send('Invalid Request')
    // }
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateJwtToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const followingIds = await returnFollowingUserIds(username)
    const userRelatedTweetsQuery = `
    SELECT tweet.tweet_id
      FROM tweet INNER JOIN user ON user.user_id = tweet.user_id
      WHERE user.user_id IN (${followingIds})
      AND tweet.tweet_id = ${tweetId}
    `
    const userRelatedTweetsObj = await db.get(userRelatedTweetsQuery)
    if (userRelatedTweetsObj !== undefined) {
      //   const likeTweetsQuery = `
      //   SELECT user.name AS name,
      //     reply.reply AS reply
      //   FROM user INNER JOIN reply ON user.user_id=reply.user_id
      //   WHERE reply.tweet_id = ${tweetId}
      // `
      const likeTweetsQuery = `
        SELECT user.name AS name,
          reply.reply AS reply
        FROM tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id
          INNER JOIN user ON reply.user_id=user.user_id
        WHERE tweet.tweet_id=${tweetId}
        `
      const dbResponse = await db.all(likeTweetsQuery)
      const repliesArray = dbResponse.map(each => ({
        name: each.name,
        reply: each.reply,
      }))
      response.send({replies: repliesArray})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
    // const getAllFollowingUsers = `
    // SELECT follower.following_user_id AS followingUserId
    // FROM user INNER JOIN follower ON user.user_id=follower.follower_used_id
    // WHERE user.username='${username}'
    // `
    // const allFollowingUsersObj = await db.all(getAllFollowingUsers)
    // const allFollowingUsers = []
    // allFollowingUsersObj.map(each =>
    //   allFollowingUsers.push(each.followingUserId),
    // )
    // if (allFollowingUsers.includes(tweetId)) {
    //   const replyOfFollowingUser = `
    //       SELECT user.name AS name, reply.reply AS reply
    //       FROM user INNER JOIN reply ON user.user_id=reply.user_id
    //       WHERE reply.tweet_id =${tweetId}
    // `
    //   const repliedNamesObj = await db.all(replyOfFollowingUser)
    //   const repliedNames = repliedNamesObj.map(each => ({
    //     name: repliedNamesObj.name,
    //     reply: repliedNamesObj.reply,
    //   }))
    //   response.send({replies: repliedNames})
    // } else {
    //   response.status(401)
    //   response.send('Invalid Request')
    // }
  },
)

app.get('/user/tweets/', authenticateJwtToken, async (request, response) => {
  const {username} = request
  // const getTweets = `
  // SELECT tweet.tweet AS tweet,
  //  COUNT(
  //     CASE
  //       WHEN like.like_id IS NULL THEN 0
  //       ELSE 1
  //     END
  //   ) AS likes,
  //   COUNT(CASE
  //       WHEN reply.reply_id IS NULL THEN 0
  //       ELSE 1
  //     END) AS replies,
  //   tweet.date_time AS dateTime
  // FROM user INNER JOIN tweet ON tweet.user_id=user.user_id
  //   LEFT JOIN like ON tweet.tweet_id=like.tweet_id
  //   LEFT JOIN reply ON like.tweet_id = reply.tweet_id
  // WHERE user.username='${username}'
  // GROUP BY tweet.tweet_id
  // `
  const getTweets = `
  SELECT tweet.tweet AS tweet,
    COUNT(DISTINCT like.like_id) AS likes,
    COUNT(DISTINCT reply.reply_id) AS replies,
    tweet.date_time AS dateTime
  FROM user INNER JOIN tweet ON user.user_id=tweet.user_id 
    INNER JOIN like ON tweet.tweet_id=like.tweet_id 
    INNER JOIN reply ON like.tweet_id = reply.tweet_id
  WHERE user.username='${username}'
  GROUP BY tweet.tweet_id
  `

  const tweet = await db.all(getTweets)
  response.send(tweet)
  // const getallTweetsQuery = `
  // SELECT
  //   user.username,
  //   tweet.tweet_id,
  //   tweet.tweet AS tweet,
  //   COUNT(like.like_id) AS likes,
  //   COUNT(reply.reply_id) AS replies,
  //   tweet.date_time AS dateTime
  // FROM (user INNER JOIN tweet ON user.user_id =tweet.user_id) AS t1
  // INNER JOIN reply ON t1.user_id = reply.user_id
  // INNER JOIN like ON t1.user_id = like.user_id
  // WHERE t1.username = '${username}'
  // GROUP BY tweet.tweet_id
  // `
  // const allTweets = await db.all(getallTweetsQuery)
  // response.send(allTweets)
})

app.post('/user/tweets/', authenticateJwtToken, async (request, response) => {
  const {username} = request
  const {tweet} = request.body
  const getUserId = `
  SELECT user_id AS userId
  FROM user
  WHERE username= '${username}'
  `
  const userIdDet = await db.get(getUserId)
  const addTweetQuery = `
  INSERT INTO 
    tweet(tweet,user_id)
  Values(
    '${tweet}',${userIdDet.userId}
  )
  `
  await db.run(addTweetQuery)
  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateJwtToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const userRelatedTweetsQuery = `
    SELECT tweet.tweet_id
      FROM tweet INNER JOIN user ON user.user_id = tweet.user_id
      WHERE user.username='${username}'
      AND tweet.tweet_id = ${tweetId}
    `
    const userRelatedTweetsObj = await db.get(userRelatedTweetsQuery)
    if (userRelatedTweetsObj !== undefined) {
      const deleteTweetsQuery = `
    DELETE FROM tweet
    WHERE tweet_id= ${tweetId}
    `
      await db.run(deleteTweetsQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
