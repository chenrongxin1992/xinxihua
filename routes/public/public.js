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

var mysql  = require('mysql');  //调用MySQL模块

//创建一个connection
var connection = mysql.createConnection({     
  host     : '127.0.0.1',       //主机
  user     : 'root',               //MySQL认证用户名
  password : 'A_Diffcult_Password_0704',        //MySQL认证用户密码
  port: '3306',  
  database:'cssedocs',                 //端口号
}); 
//创建一个connection
connection.connect(function(err){
    if(err){        
          console.log('[query] - :'+err);
        return;
    }
      console.log('[connection connect]  succeed!');
});  

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

router.get('/searchtxt_mongover',function(req,res){
	let searchtxt = decodeURIComponent(req.query.searchtxt),
		filetype = req.query.type,
		type = 0,
		page = req.query.page,
		limit = req.query.limit

	page ? page : 1;//当前页
	limit ? limit : 10;//每页数据
	if(!page){
		page = 1
	}
	if(!limit){
		limit = 10
	}
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

	//let reg = new RegExp(searchtxt,'i')//不区分大小写
	let key_arr = []
	async.waterfall([
		function(cb){
			let word_arr = searchtxt.split(" ")
			word_arr.forEach(function(item,index){
				console.log('item--->',item)
				key_arr.push({'filename':{'$regex':new RegExp(item,'i')}})
				key_arr.push({'filetag':{'$regex':new RegExp(item,'i')}})
				key_arr.push({'cn':{'$regex':new RegExp(item,'i')}})
			})
			console.log('key_arr--->',key_arr)
			cb(null)
		},
		function(cb){
			let search = Save.find({//多条件模糊查询
					$or : key_arr
				}
			)//search
			// let search = Save.find({//多条件模糊查询
			// 		$or : [
			// 			{filename:{$regex:reg}},
			// 			{filetag:{$regex:reg}},
			// 			{cn:{$regex:reg}}
			// 		]
			// 	}
			// )//search
			search.where('filetype').in(filetype)
			search.count()
			search.exec(function(err,total){
				if(err){
					console.log('search total err--->',err)
					cb(err)
				}
				cb(null,total)		
			})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
				limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({//多条件模糊查询
					$or : key_arr
				}
			)//search
			// let search = Save.find({//多条件模糊查询
			// 		$or : [
			// 			{filename:{$regex:reg}},
			// 			{filetag:{$regex:reg}},
			// 			{cn:{$regex:reg}}
			// 		]
			// 	}
			// )//search
			search.where('filetype').in(filetype)
			search.sort({'created_time':-1})
			search.limit(limit)
			search.skip(numSkip)
			search.exec(function(err,docs){
				if(err){
					console.log('search err--->',err)
					cb(err)
				}
				if(!docs){
					console.log('kong--->',kong)
					cb('no result')
				}
				if(docs){
					//console.log('docs--->',docs)
					let res = {}
						res.docs = docs,
						res.type = type,
						res.count = total
						res.curr = page
					cb(null,res)
					//return res.render('public/search',{'docs':docs,'type':type,'count':total})//0.word,1.ppt,2.pdf,3.execl,4.txt,5.img
				}
			})
		}
	],function(error,result){
		if(error){
			console.log('async waterfall final error')
			return res.json({'code':-1,'msg':err})
		}
		console.log('result--->',result.docs)
		return res.render('public/search',{'docs':result.docs,'type':result.type,'count':result.count,'curr':result.curr})
	})
	
	// let search = Save.find({//多条件模糊查询
	// 		$or : [
	// 			{filename:{$regex:reg}},
	// 			{filetag:{$regex:reg}},
	// 			{cn:{$regex:reg}}
	// 		]
	// 	}
	// )//search
	// search.where('filetype').in(filetype)
	// search.sort({'created_time':-1})
	// search.limit(100)
	// search.exec(function(err,docs){
	// 	if(err){
	// 		console.log('search err--->',err)
	// 		return res.json({'code':-1,'msg':err})
	// 	}
	// 	if(!docs){
	// 		console.log('kong--->',kong)
	// 	}
	// 	if(docs){
	// 		console.log('docs--->',docs)
	// 		return res.render('public/search',{'docs':docs,'type':type})//0.word,1.ppt,2.pdf,3.execl,4.txt,5.img
	// 	}
	// })
}).get('/searchtxt',function(req,res){
	let searchtxt = decodeURIComponent(req.query.searchtxt),
		filetype = req.query.type,
		type = 0,
		page = req.query.page,
		limit = req.query.limit

	page ? page : 1;//当前页
	limit ? limit : 10;//每页数据
	if(!page){
		page = 1
	}
	if(!limit){
		limit = 10
	}
	if(!filetype || filetype==0){
		//filetype = ['doc','docx']
		filetype = '\'doc\',\'docx\''
	}else if(filetype==1){
		//filetype = ['ppt','pptx']
		type = 1
		filetype = '\'ppt\',\'pptx\''
	}else if(filetype==2){
		//filetype = ['pdf']
		filetype = '\'pdf\''
		type = 2
	}else if(filetype==3){
		//filetype = ['xls','xlsx']
		filetype = '\'xls\',\'xlsx\''
		type = 3
	}else if(filetype==4){
		//filetype = ['txt']
		filetype = '\'txt\''
		type = 4
	}else{
		//filetype = ['jpg','png','jpeg','PNG','gif']
		filetype = '\'JPEG\',\'png\',\'jpeg\',\'PNG\',\'GIF\',\'gif\',\'jpg\''
		type = 5
	}
	console.log('type--->',type)
	console.log('filetype--->',filetype)
	console.log('searchtxt--->',searchtxt)

	let key_arr = []
	async.waterfall([
		function(cb){
			//SELECT * FROM minshianli WHERE MATCH (zw) AGAINST('1');
			let countsql = 'select count(*) as \'count\' from docinfo where MATCH (filename) AGAINST(\''+searchtxt+'\') and filetype in ('+filetype+') and ispublic=1 and isdelete=0'
			connection.query(countsql,function(err,result,fields){
				if(err){
					console.log('mysql select err',err)
					cb(err)
				}else{
					console.log('counts =====',result[0].count)
					
					cb(null,result[0].count)
				}
			})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let searchsql = 'select * from docinfo where MATCH (filename) AGAINST(\''+searchtxt+'\') and filetype in ('+filetype+') and ispublic=1 and isdelete=0 limit ?,?'  
			connection.query(searchsql,[numSkip,limit],function(err,result){
				if(err){
					console.log('searchtxt router searchsql err',err)
					cb(err)
				}else{
					cb(null,result,total)
				}
			})
		},
		function(result,total,cb){
			let final_arr = []
				result.forEach(function(item,index){
					let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item.id
					tempdata.filename = item.filename
					tempdata.finalname = item.finalname
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					// if(item.filetag){
					// 	tempdata.filetag = item.filetag.join(', ')
					// }else{
					// 	tempdata.filetag = ''
					// }
					tempdata.cn = item.cn
					tempdata.filetag = item.filetag
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					final_arr.push(tempdata)
					delete tempdata
				})
				let res = {}
					res.docs = final_arr,
					res.type = type,
					res.count = total
					res.curr = page
				cb(null,res)
		}
	],function(error,result){
		if(error){
			console.log('async waterfall final error')
			return res.json({'code':-1,'msg':err})
		}
		console.log('result--->',result.docs)
		//return false
		return res.render('public/search',{'docs':result.docs,'type':result.type,'count':result.count,'curr':result.curr})
	})
})

module.exports = router;
