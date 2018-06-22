var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
//var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
const fs = require('fs')

//session相关
const session = require('express-session')
var RedisStrore = require('connect-redis')(session);

//log4js
const log4js= require('./log/logConfig')
const logger = log4js.getLogger()//根据需要获取logger
const errlogger = log4js.getLogger('err')
const othlogger = log4js.getLogger('oth')



var app = express();

var logDirectoryReq = path.join(__dirname, 'log/reqlog')
var logDirectoryErr = path.join(__dirname, 'log/errlog')
var logDirectoryOth = path.join(__dirname, 'log/othlog')
// ensure log directory exists
fs.existsSync(logDirectoryReq) || fs.mkdirSync(logDirectoryReq)
fs.existsSync(logDirectoryErr) || fs.mkdirSync(logDirectoryErr)
fs.existsSync(logDirectoryOth) || fs.mkdirSync(logDirectoryOth)

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
log4js.useLogger(app,logger)//这样会自动记录每次请求信息，放在其他use上面
//app.use(logger('dev'));
app.use(bodyParser.json({limit:'10mb'}));
app.use(bodyParser.urlencoded({ limit:'10mb',extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/myfile',express.static(path.join(__dirname, 'upload')));


//add session
app.use(session({ 
	resave: true, //是指每次请求都重新设置session cookie，假设你的cookie是6000毫秒过期，每次请求都会再设置6000毫秒
  	saveUninitialized: false, // 是指无论有没有session cookie，每次请求都设置个session cookie ，默认给个标示为 connect.sid。
    secret: 'dangxiaoxinxihuajianshe',
    cookie:{ 
        maxAge: 120 * 60 * 60 * 1000//120小时分钟有效期(5天)
        //expires : new Date(Date.now() + 7200000)//默认是UTC时间，Date.now()获取当前时间的时间戳，输出是毫秒。
    },
    store:new RedisStrore({
      host: "127.0.0.1",
      port: 6379,
      db: 15
    })
}));
app.use(function(req,res,next){ 
  if(!req.session){
    next(new Error('no session'))
  }else{
  	console.log()
	res.locals.user = req.session.user;   // 从session 获取 user对象
    next() //中间件传递
  }
});
var index = require('./routes/index');
var users = require('./routes/users');
var public = require('./routes/public/public')
var user = require('./routes/user/user')
app.use('/', index);
app.use('/users', users);
app.use('/public',public)
app.use('/user',user)

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
