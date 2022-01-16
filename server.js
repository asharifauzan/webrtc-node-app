const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server)
const bcrypt = require('bcrypt')
const connection = require('./config/database')

app.use(require('body-parser').urlencoded({ extended: false }));
app.use(express.static('public'))
app.set('view engine', 'ejs')

connection.connect()

app.get('/register', (req, res)=> {
  res.render('register')
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

        res.redirect('dashboard')
      })
    }
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
