const mysql = require('mysql')
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'KR4KENmysql;',
  database: 'webrtc'
})

module.exports = connection
