var express = require('express');
var router = express.Router();

const request = require('request')
const Save = require('../../db/save')
const async = require('async')


//redis
const redis = require('redis')
const client = redis.createClient({host:'127.0.0.1', port: 6379, db:15, no_ready_check:true})
// if you'd like to select database 3, instead of 0 (default), call 
// client.select(3, function() { /* ... */ }); 

client.on("error", function (err) {
    console.log("redis connect Error in public router" + err);
});
client.on('connect',function(err){
	if(err){
		console.log("redis connect failed in public router" + err);
	}else{
		console.log("redis connect success in public router");
	}
})

let MyServer = "http://116.13.96.53:81",
	//CASserver = "https://auth.szu.edu.cn/cas.aspx/",
	CASserver = 'https://authserver.szu.edu.cn/authserver/',
	ReturnURL = "http://116.13.96.53:81";

//正则匹配
function pipei(str,arg){
	let zhengze = '<cas:' + arg + '>(.*)<\/cas:' + arg + '>' 
	let res = str.match(zhengze)
	if(res){
		return res[1]
	}else{
		return null
	}
}

/* GET home page. */
router.get('/', function(req, res, next) {
	console.log('in public router index')
	if(!req.query.ticket){
		let ReturnURL = 'http://qiandao.szu.edu.cn:81/csseinfo' + req.originalUrl
		console.log('ReturnURL url-->',ReturnURL)

		let url = CASserver + 'login?service=' + ReturnURL

		console.log('---------- 没有ticket ----------')

		client.get('sess:'+req.sessionID,function(rediserr,redisres){
	      if(rediserr){
	        next(new Error(rediserr))
	      }
	      if(!redisres){
	        console.log('redis 没有session ,跳转获取---->',url)
	        return res.redirect(url)
	      }
	      if(redisres && redisres!='undefined'){
	        let result = JSON.parse(redisres)
	        console.log('redis session 信息---->',result)
	        //return res.json({'msg':result})
	        return res.render('public/index', {'title':'welcome','user': result });
	      }
	    })
	}
	else{
		let ReturnURL = 'http://qiandao.szu.edu.cn:81/csseinfo' + req.originalUrl
		console.log('ReturnURL url-->',ReturnURL)
		let url = CASserver + 'login?service=' + ReturnURL

		console.log('---------- 有ticket ----------')
		client.get('sess:'+req.sessionID,function(rediserr,redisres){
	      if(rediserr){
	        next(new Error(rediserr))
	      }
	      if(!redisres){
	        console.log('redis 没有session ,request 获取---->')
	        let finalReturnURL = 'http://qiandao.szu.edu.cn:81/csseinfo'
			console.log('req.baseUrl-->',req.baseUrl)//finalReturnURL
			console.log('finalReturnURL-->',finalReturnURL)//finalReturnURL
			let ticket = req.query.ticket
			console.log('check ticket-->',ticket)
			let url = CASserver + 'serviceValidate?ticket=' + ticket + '&service=' + ReturnURL
			console.log('check url -->',url)
			request(url, function (error, response, body) {
				    if (!error && response.statusCode == 200) {
				    	console.log('body -- >',body)
				       let user = pipei(body,'user'),//工号
						   eduPersonOrgDN = pipei(body,'eduPersonOrgDN'),//学院
						   alias = pipei(body,'alias'),//校园卡号
						   cn = pipei(body,'cn'),//姓名
						   gender = pipei(body,'gender'),//性别
						   containerId = pipei(body,'containerId'),//个人信息（包括uid，）
						   nianji = null
						if(containerId){
							RankName = containerId.substring(18,21)//卡类别 jzg-->教职工
						}else{
							RankName = null
						}
						if(user){
						   	nianji = user.substring(0,4)
						}else{
						   	nianji = null
						}
						let arg = {}
							arg.nianji = nianji
						   	arg.user = user
						   	arg.eduPersonOrgDN = eduPersonOrgDN
						   	arg.alias = alias
						   	arg.cn = cn
						   	arg.gender = gender
						   	arg.containerId = containerId
						   	arg.RankName = RankName

						   console.log('check arg-->',arg)
						   if(!arg.user){
						   		console.log('ticket is unvalid,重新回去获取ticket，清空session')
						   		delete req.session.user 
						   		console.log('check req.session.user-->',req.session.user)
						   		return res.redirect(finalReturnURL)
						   }else{
						   		req.session.user = arg
						   		arg = null
						   		return res.redirect(finalReturnURL)
						  }
				     }else{
				     	console.log(error)
				     	return res.json({'err':error})
				     }
			    })
	      }
	      if(redisres && redisres!='undefined'){
	        let result = JSON.parse(redisres)
	        console.log('redis session 信息---->',result)
	        //return res.json({'msg':result})
	        return res.render('public/index', {'title':'welcome','user': result });
	      }
	    })
	}
	//res.render('public/index', { title: 'Express' });
});

router.get('/searchtxt',function(req,res){
	let searchtxt = req.query.searchtxt,
		filetype = req.query.type,
		type = 0
	if(!filetype || filetype==0){
		filetype = ['doc','docx']
	}else if(filetype==1){
		filetype = ['ppt','pptx']
		type = 1
	}else if(filetype==2){
		filetype = ['pdf']
		type = 2
	}else if(filetype==3){
		filetype = ['xls','xlsx']
		type = 3
	}else if(filetype==4){
		filetype = ['txt']
		type = 4
	}else{
		filetype = ['jpg','png','jpeg','PNG','gif']
		type = 5
	}
	console.log('type--->',type)
	console.log('filetype--->',filetype)
	console.log('searchtxt--->',searchtxt)
	let reg = new RegExp(searchtxt,'i')//不区分大小写
	let search = Save.find({//多条件模糊查询
			$or : [
				{filename:{$regex:reg}},
				{filetag:{$regex:reg}},
				{cn:{$regex:reg}}
			]
		}
	)//search
	search.where('filetype').in(filetype)
	search.sort({'created_time':-1})
	search.limit(100)
	search.exec(function(err,docs){
		if(err){
			console.log('search err--->',err)
			return res.json({'code':-1,'msg':err})
		}
		if(!docs){
			console.log('kong--->',kong)
		}
		if(docs){
			console.log('docs--->',docs)
			return res.render('public/search',{'docs':docs,'type':type})//0.word,1.ppt,2.pdf,3.execl,4.txt,5.img
		}
	})
})

module.exports = router;
