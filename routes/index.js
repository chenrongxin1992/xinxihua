var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
	console.log('首页')
	res.redirect('/csseinfo/public?w=w')
  //res.render('index', { title: 'Express' });
});

module.exports = router;
