const express = require('express')
const app = express()
const cookieParser = require("cookie-parser")
const sessions = require('express-session')
const server = require('http').createServer(app)
const io = require('socket.io')(server)
const bcrypt = require('bcrypt')
const connection = require('./config/database')

const oneDay = 1000 * 60 * 60 * 24;
app.use(sessions({
    secret: "KR4KENwebrtc;",
    saveUninitialized:true,
    cookie: { maxAge: oneDay },
    resave: false 
}))
app.use(cookieParser())
app.use(require('body-parser').urlencoded({ extended: false }));
app.use(express.static('public'))
app.set('view engine', 'ejs')

connection.connect()

app.get('/', (req, res)=> {
  res.redirect('login')
})

app.get('/login', (req, res)=> {
  if (typeof req.session.user === "undefined") {
    res.render('home')
  } else {
    res.redirect('dashboard')
  }
})

app.get('/register', (req, res)=> {
  if (typeof req.session.user === "undefined") {
    res.render('register')
  } else {
    res.redirect('dashboard')
  }
})

app.post('/login', async (req, res)=> {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 12)

  connection.query(`SELECT * FROM user WHERE username = '${username}'`, async (err, results) => {
    if (err) {
      const msg = err
      res.render('home', { message: msg })
    }
    
    if (results.length > 0) {
      const correct = await bcrypt.compare(password, results[0].password)
      
      if (correct) {
        const session = req.session
        session.user = {}
        session.user.username = username
        session.user.id = results[0].id
            
        res.redirect('dashboard')
      } else {
        const msg = "Username or Password Incorrect"
        res.render('home', { message: msg })
      }

    } else {
      const msg = "Username or Password Incorrect"
      res.render('home', { message: msg })
    }
  })
})

app.post('/register', async (req, res)=> {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 12)

  connection.query(`SELECT * FROM user WHERE username = '${username}'`, (err, results)=> {
    if(results.length > 0) {
      const msg = "Account already registered"
      res.render('register', { message: msg })
    } else {
      connection.query(`INSERT INTO user VALUES (0, '${username}', '${hashedPassword}')`, (err, results)=> {
        if (err) {
          const msg = err
          res.render('register', { message: msg })
        }

        const session = req.session
        session.user = {}
        session.user.username = username
        session.user.id = results.insertId
        
        res.redirect('dashboard')
      })
    }
  })
})

app.get('/logout', (req, res)=> {
  const session = req.session

  session.destroy((err)=> {
    if (err) res.redirect('/dashboard')
    else res.redirect('/')
  })
})

app.get('/dashboard', (req, res)=> {
  if (typeof req.session.user === "undefined") {
    res.redirect('/')
  } else {

    const id_user = req.session.user.id
    connection.query(`SELECT room.id, user.username, room.room_name FROM user INNER JOIN room ON user.id = room.id_user WHERE user.id = '${id_user}'`, (err, results)=> {
      if (err) {
        const msg = err
        res.render('dashboard', { message: msg })
      }
      res.render('dashboard', { rooms: results })
    })
  }
})

app.post('/room', (req, res)=> {
  const { room } = req.body
  const id_user = req.session.user.id
  connection.query(`INSERT INTO room VALUES (NULL, '${id_user}', '${room}')`, (err, results)=> {
    if (err) {
      const msg = err
      res.render('dashboard', { message: msg })
    }

    // TODO: create room name validation for duplicate
    res.redirect('dashboard')
  })
})

app.get('/:room', (req, res)=> {
  res.render('room', { room: req.params.room })
})

io.on('connection', (socket) => {
  socket.on('join', (roomId) => {
    const selectedRoom = io.sockets.adapter.rooms[roomId]
    const numberOfClients = selectedRoom ? selectedRoom.length : 0

    // These events are emitted only to the sender socket.
    if (numberOfClients == 0) {
      console.log(`Creating room ${roomId} and emitting room_created socket event`)
      socket.join(roomId)
      socket.emit('room_created', roomId)
    } else if (numberOfClients == 1) {
      console.log(`Joining room ${roomId} and emitting room_joined socket event`)
      socket.join(roomId)
      socket.emit('room_joined', roomId)
    } else {
      console.log(`Can't join room ${roomId}, emitting full_room socket event`)
      socket.emit('full_room', roomId)
    }
  })

  // These events are emitted to all the sockets connected to the same room except the sender.
  socket.on('start_call', (roomId) => {
    console.log(`Broadcasting start_call event to peers in room ${roomId}`)
    socket.broadcast.to(roomId).emit('start_call')
  })
  socket.on('webrtc_offer', (event) => {
    console.log(`Broadcasting webrtc_offer event to peers in room ${event.roomId}`)
    socket.broadcast.to(event.roomId).emit('webrtc_offer', event.sdp)
  })
  socket.on('webrtc_answer', (event) => {
    console.log(`Broadcasting webrtc_answer event to peers in room ${event.roomId}`)
    socket.broadcast.to(event.roomId).emit('webrtc_answer', event.sdp)
  })
  socket.on('webrtc_ice_candidate', (event) => {
    console.log(`Broadcasting webrtc_ice_candidate event to peers in room ${event.roomId}`)
    socket.broadcast.to(event.roomId).emit('webrtc_ice_candidate', event)
  })

  // Handle client disconnect
  socket.on('disconnect', ()=> {
    console.log(socket.id, " is left")
  })

  socket.on('leave-room', roomId=> {
    socket.leave(roomId)
    socket.broadcast.to(roomId).emit('user-left', socket.id)
  })
})

// START THE SERVER =================================================================
const port = process.env.PORT || 3000
server.listen(port, () => {
  console.log(`Express server listening on port ${port}`)
})
