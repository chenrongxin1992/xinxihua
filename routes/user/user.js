var express = require('express');
var router = express.Router();

const request = require('request')
const multiparty = require('multiparty')
const path = require('path')
const baseUploadDir = path.resolve(__dirname, '../../upload');
const fs = require('fs')
const moment = require('moment')
const Save = require('../../db/save')
const async = require('async')
const newfs = require('fs-extra')
const jimp = require('jimp')


//redis
const redis = require('redis')
const client = redis.createClient({host:'127.0.0.1', port: 6379, db:15, no_ready_check:true})
// if you'd like to select database 3, instead of 0 (default), call 
// client.select(3, function() { /* ... */ }); 

client.on("error", function (err) {
    console.log("redis connect Error in user router" + err);
});
client.on('connect',function(err){
	if(err){
		console.log("redis connect failed in user router" + err);
	}else{
		console.log("redis connect success in user router");
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
	console.log('in user router index')
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
	        return res.render('user/index', {'title':'user','user': result });
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
	        return res.render('user/index', {'title':'user','user': result });
	      }
	    })
	}
	//res.render('public/index', { title: 'Express' });
});

//获取用户private pdf
router.get('/pripdf',function(req,res){
	console.log('in user router pripdf')
	return res.render('user/private/pripdf')
}).get('/pripdf_data',function(req,res){
	console.log('in pripdf_data router')
	let page = req.query.page,
		limit = req.query.limit
	page ? page : 1;//当前页
	limit ? limit : 15;//每页数据
	console.log(page,limit)
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['pdf']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					cb(null,total)
				})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({'filetype':{'$in':['pdf']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.limit(limit)
				search.skip(numSkip)
				search.exec(function(err,docs){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('check docs-->',docs)
					cb(null,docs,total)
				})
		},
		function(docs,total,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.filesize = item.filesize
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				data.count = total
				console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		return res.json({'code':0,'msg':'获取数据成功','count':result.count,'data':result})
	})
})

//获取用户private ppt
router.get('/prippt',function(req,res){
	console.log('in user router prippt')
	return res.render('user/private/prippt')
}).get('/prippt_data',function(req,res){
	console.log('in prippt_data router')
	let page = req.query.page,
		limit = req.query.limit
	page ? page : 1;//当前页
	limit ? limit : 15;//每页数据
	console.log(page,limit)
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['ppt','pptx']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					cb(null,total)
				})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({'filetype':{'$in':['ppt','pptx']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.limit(limit)
				search.skip(numSkip)
				search.exec(function(err,docs){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('check docs-->',docs)
					cb(null,docs,total)
				})
		},
		function(docs,total,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				data.count = total
				console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		return res.json({'code':0,'msg':'获取数据成功','count':result.count,'data':result})
	})
})

//获取用户private word
router.get('/priword',function(req,res){
	console.log('in user router priword')
	return res.render('user/private/priword')
}).get('/priword_data',function(req,res){
	console.log('in priword_data router')
	let page = req.query.page,
		limit = req.query.limit
	page ? page : 1;//当前页
	limit ? limit : 15;//每页数据
	console.log(page,limit)
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['doc','docx']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					cb(null,total)
				})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({'filetype':{'$in':['doc','docx']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.limit(limit)
				search.skip(numSkip)
				search.exec(function(err,docs){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('check docs-->',docs)
					cb(null,docs,total)
				})
		},
		function(docs,total,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				data.count = total
				console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		return res.json({'code':0,'msg':'获取数据成功','count':result.count,'data':result})
	})
})

//获取用户private excel
router.get('/priexcel',function(req,res){
	console.log('in user router priexcel')
	return res.render('user/private/priexcel')
}).get('/priexcel_data',function(req,res){
	console.log('in priexcel_data router')
	let page = req.query.page,
		limit = req.query.limit
	page ? page : 1;//当前页
	limit ? limit : 15;//每页数据
	console.log(page,limit)
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['xls','xlsx']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					cb(null,total)
				})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({'filetype':{'$in':['xls','xlsx']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.limit(limit)
				search.skip(numSkip)
				search.exec(function(err,docs){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('check docs-->',docs)
					cb(null,docs,total)
				})
		},
		function(docs,total,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				data.count = total
				console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		return res.json({'code':0,'msg':'获取数据成功','count':result.count,'data':result})
	})
})

//获取用户private txt
router.get('/pritxt',function(req,res){
	console.log('in user router pritxt')
	return res.render('user/private/pritxt')
}).get('/pritxt_data',function(req,res){
	console.log('in pritxt_data router')
	let page = req.query.page,
		limit = req.query.limit
	page ? page : 1;//当前页
	limit ? limit : 15;//每页数据
	console.log(page,limit)
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['txt']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					cb(null,total)
				})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({'filetype':{'$in':['txt']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.limit(limit)
				search.skip(numSkip)
				search.exec(function(err,docs){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('check docs-->',docs)
					cb(null,docs,total)
				})
		},
		function(docs,total,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				data.count = total
				console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		return res.json({'code':0,'msg':'获取数据成功','count':result.count,'data':result})
	})
})

//获取用户private img
router.get('/priimg',function(req,res){
	console.log('in user router priimg')
	return res.render('user/private/priimg')
}).get('/priimg_data',function(req,res){
	console.log('in priimg_data router')
	let page = req.query.page,
		limit = req.query.limit
	page ? page : 1;//当前页
	limit ? limit : 15;//每页数据
	console.log(page,limit)
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['jpg','png','jpeg','gif','PNG','JPG','JPEG','GIF']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					cb(null,total)
				})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({'filetype':{'$in':['jpg','png','jpeg','gif','PNG','JPG','JPEG','GIF']}})
				search.where('ispublic').equals(0)
				search.where('isdelete').equals(0)
				search.limit(limit)
				search.skip(numSkip)
				search.exec(function(err,docs){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('check docs-->',docs)
					cb(null,docs,total)
				})
		},
		function(docs,total,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				data.count = total
				console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		return res.json({'code':0,'msg':'获取数据成功','count':result.count,'data':result})
	})
})

//获取用户public ppt
router.get('/pubppt',function(req,res){
	console.log('in user router pubppt')
	return res.render('user/public/pubppt')
}).get('/pubppt_data',function(req,res){
	console.log('in pubppt_data router')
	let page = req.query.page,
		limit = req.query.limit
	page ? page : 1;//当前页
	limit ? limit : 15;//每页数据
	console.log(page,limit)
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['ppt','pptx']}})
				search.where('ispublic').equals(1)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					cb(null,total)
				})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({'filetype':{'$in':['ppt','pptx']}})
				search.where('ispublic').equals(1)
				search.where('isdelete').equals(0)
				search.limit(limit)
				search.skip(numSkip)
				search.exec(function(err,docs){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('check docs-->',docs)
					cb(null,docs,total)
				})
		},
		function(docs,total,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				data.count = total
				console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		return res.json({'code':0,'msg':'获取数据成功','count':result.count,'data':result})
	})
})

//获取用户public word
router.get('/pubword',function(req,res){
	console.log('in user router pubword')
	return res.render('user/public/pubword')
}).get('/pubword_data',function(req,res){
	console.log('in pubword_data router')
	let page = req.query.page,
		limit = req.query.limit
	page ? page : 1;//当前页
	limit ? limit : 15;//每页数据
	console.log(page,limit)
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['doc','docx']}})
				search.where('ispublic').equals(1)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					cb(null,total)
				})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({'filetype':{'$in':['doc','docx']}})
				search.where('ispublic').equals(1)
				search.where('isdelete').equals(0)
				search.limit(limit)
				search.skip(numSkip)
				search.exec(function(err,docs){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('check docs-->',docs)
					cb(null,docs,total)
				})
		},
		function(docs,total,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				data.count = total
				console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		return res.json({'code':0,'msg':'获取数据成功','count':result.count,'data':result})
	})
})

//获取用户public excel
router.get('/pubexcel',function(req,res){
	console.log('in user router pubexcel')
	return res.render('user/public/pubexcel')
}).get('/pubexcel_data',function(req,res){
	console.log('in pubexcel_data router')
	let page = req.query.page,
		limit = req.query.limit
	page ? page : 1;//当前页
	limit ? limit : 15;//每页数据
	console.log(page,limit)
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['xls','xlsx']}})
				search.where('ispublic').equals(1)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					cb(null,total)
				})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({'filetype':{'$in':['xls','xlsx']}})
				search.where('ispublic').equals(1)
				search.where('isdelete').equals(0)
				search.limit(limit)
				search.skip(numSkip)
				search.exec(function(err,docs){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('check docs-->',docs)
					cb(null,docs,total)
				})
		},
		function(docs,total,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				data.count = total
				console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		return res.json({'code':0,'msg':'获取数据成功','count':result.count,'data':result})
	})
})

//获取用户public txt
router.get('/pubtxt',function(req,res){
	console.log('in user router pubtxt')
	return res.render('user/public/pubtxt')
}).get('/pubtxt_data',function(req,res){
	console.log('in pubtxt_data router')
	let page = req.query.page,
		limit = req.query.limit
	page ? page : 1;//当前页
	limit ? limit : 10;//每页数据
	console.log(page,limit)
	let count = 0
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['txt']}})
				search.where('ispublic').equals(1)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					count = total
					cb(null,total)
				})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({'filetype':{'$in':['txt']}})
				search.where('ispublic').equals(1)
				search.where('isdelete').equals(0)
				search.limit(limit)
				search.skip(numSkip)
				search.exec(function(err,docs){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					//console.log('check docs-->',docs)
					cb(null,docs)
				})
		},
		function(docs,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					//console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				//data.count = total
				//console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		//console.log('result.length',result.length)
		//let count = result.count
		return res.json({'code':0,'msg':'获取数据成功','count':count,'data':result})
	})
})

//获取用户public img
router.get('/pubimg',function(req,res){
	console.log('in user router pubimg')
	return res.render('user/public/pubimg')
}).get('/pubimg_data',function(req,res){
	console.log('in pubimg_data router')
	let page = req.query.page,
		limit = req.query.limit
	page ? page : 1;//当前页
	limit ? limit : 15;//每页数据
	console.log(page,limit)
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['jpg','png','jpeg','gif','PNG']}})
				search.where('ispublic').equals(1)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					cb(null,total)
				})
		},
		function(total,cb){
			let numSkip = (page-1)*limit
			limit = parseInt(limit)
			console.log('check -- >',limit,page,numSkip)
			let search = Save.find({'filetype':{'$in':['jpg','png','jpeg','gif','PNG']}})
				search.where('ispublic').equals(1)
				search.where('isdelete').equals(0)
				search.limit(limit)
				search.skip(numSkip)
				search.exec(function(err,docs){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('check docs-->',docs)
					cb(null,docs,total)
				})
		},
		function(docs,total,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				data.count = total
				console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		return res.json({'code':0,'msg':'获取数据成功','count':result.count,'data':result})
	})
})

//获取用户public pdf
router.get('/pubpdf',function(req,res){
	console.log('in user router pubpdf')
	return res.render('user/public/pubpdf')
}).get('/pubpdf_data',function(req,res){
	console.log('in pubpdf_data router')
	let page = req.query.page,
		limit = req.query.limit,
		keyword = req.query.keyword
	page ? page : 1;//当前页
	limit ? limit : 15;//每页数据
	keyword ? keyword : ''
	console.log(page,limit,keyword)
	async.waterfall([
		function(cb){
			let search = Save.find({'filetype':{'$in':['pdf']}})
				search.where('ispublic').equals(1)
				search.where('isdelete').equals(0)
				search.count()
				search.exec(function(err,total){
					if(err){
						console.log('search err-->',err.stack)
						cb(err)
					}
					console.log('记录总数-->',total)
					cb(null,total)
				})
		},
		function(total,cb){
			if(keyword){
				console.log('有搜索参数')
				let qs_keyword = new RegExp(keyword,'i')
				console.log('qs_keyword-->',qs_keyword)
				let numSkip = (page-1)*limit
					limit = parseInt(limit)
					console.log('check -- >',limit,page,numSkip)
					let search = Save.find({
							$or : [
								{filename:{$regex:qs_keyword}},
								{filetag:{$regex:qs_keyword}},
								{cn:{$regex:qs_keyword}}
							]
						})
						search.where('filetype').in(['pdf'])
						search.where('ispublic').equals(1)
						search.where('isdelete').equals(0)
						search.limit(limit)
						search.skip(numSkip)
						search.exec(function(err,docs){
							if(err){
								console.log('search err-->',err.stack)
								cb(err)
							}
							console.log('check docs-->',docs.length)
							//增加一步获取数量
							let search1 = Save.find({
									$or : [
										{filename:{$regex:qs_keyword}},
										{filetag:{$regex:qs_keyword}}
									]
								})
								search1.where('filetype').in(['pdf'])
								search1.where('ispublic').equals(1)
								search1.where('isdelete').equals(0)
								search1.count()
								search1.exec(function(e,d){
									if(e){
										console.log('获取数量出错-->',e)
										cb(e)
									}
									console.log('有参数查询，数量-->',d)
									cb(null,docs,d)
								})
						})
			}else{
				let numSkip = (page-1)*limit
					limit = parseInt(limit)
					console.log('check -- >',limit,page,numSkip)
					let search = Save.find({'filetype':{'$in':['pdf']}})
						search.where('ispublic').equals(1)
						search.where('isdelete').equals(0)
						search.limit(limit)
						search.skip(numSkip)
						search.exec(function(err,docs){
							if(err){
								console.log('search err-->',err.stack)
								cb(err)
							}
							console.log('check docs-->',docs)
							cb(null,docs,total)
						})
			}
		},
		function(docs,total,cb){
			//重新封装数据
			//重新封装数据
			let data = []//最终数据
			docs.forEach(function(item,index){
				let tempdata = {}
					console.log('item-->',item)
					tempdata._id = item._id
					tempdata.filename = item.filename
					tempdata.filetype = item.filetype
					tempdata.filesize = item.filesize
					tempdata.filetag = item.filetag.join(', ')
					tempdata.downloadlink = item.downloadLink
					tempdata.created_time = item.created_time
					data.push(tempdata)
					delete tempdata
				})
				data.count = total
				console.log('返回数据-->',data)
				cb(null,data)
		}
	],function(error,result){
		if(error){
			console.log('search err-->',err.stack)
			return res.json({'code':-1,'msg':err.stack,'count':0,'data':''})
		}
		return res.json({'code':0,'msg':'获取数据成功','count':result.count,'data':result})
	})
})

//复制文件
function copyfile(from, to) {
 	//fs.writeFileSync(to, fs.readFileSync(from));
    fs.createReadStream(from).pipe(fs.createWriteStream(to));//大文件复制
}
//上传
router.get('/upload',function(req,res){
	console.log('in user router upload')
	return res.render('user/upload')
}).post('/upload',function(req,res){
	console.log('in user router post upload')

	client.get('sess:'+req.sessionID,function(rediserr,redisres){
	    if(rediserr){
	        next(new Error(rediserr))
	        return false
	    }
	    if(!redisres){
	      	console.log('redis 没有session')
	        return false
	     }
	    if(redisres && redisres!='undefined'){
	    	//console.log('req.body---->',req)
	        let result = JSON.parse(redisres),
	        	userDir = baseUploadDir + '\\' + result.user.cn + result.user.alias
	        console.log('baseUploadDir--->',baseUploadDir)
	        console.log('userDir--->',userDir)
	        fs.existsSync(userDir) || fs.mkdirSync(userDir)
	        let form = new multiparty.Form();
			    //设置编码
			    form.encoding = 'utf-8';
			    //设置文件存储路径
			    form.uploadDir = userDir
			    //console.log('form.uploadDir-->',form.uploadDir)
			    //设置单文件大小限制
			    form.maxFilesSize = 10 * 1024 * 1024;
			    //form.maxFields = 1000;  设置所以文件的大小总和
			    form.parse(req, function(err, fields, files) {
			    	if(err){
			    		console.log(err)
			    	}
			    	console.log('fields--->',fields)
			    	console.log()
			    	console.log('files--->',files)
			    	console.log()
			    	console.log('files file[0]--->',files.file)
			    	let fullfilename = files.file[0].originalFilename, //xxxx.ppt
			    		tmp = fullfilename.split('.')

			    	console.log('tmp---->',tmp)
			    	console.log('userDir---->',userDir)

			    	let filetype = tmp.pop(), 
			    		filename = tmp.join(''),
			    		
			    		filesize = files.file[0].size,
			    		getfilename = files.file[0].path

			    	console.log('filename--->',filename)
			    	let newfullfilename = filename + '.' +filetype
			    	let tmpfilename = userDir+'\\'+getfilename.split('\\')[4]
			    	console.log('tmpfilename--->',tmpfilename)
			    	console.log('newfullfilename--->',newfullfilename)
			    	//同步重命名文件名
      				fs.rename(tmpfilename,userDir+'\\'+newfullfilename,function(err,fsresult){
      					if(err){
      						console.log('rename err---->',err)
      						return res.json({'code':-1})
      					}
      					//如果是图片，存下图片位置，方便预览
				    	let reg = RegExp(/image/)
				    	let checkheaders = files.file[0].headers
				    	console.log('checkheaders--->',checkheaders)

				    	let tmpcontent_typearr = JSON.stringify(checkheaders).split(','),
				    		imgsuolvepath = null,
				    		finalname2 = null
				    	if(reg.test(tmpcontent_typearr[tmpcontent_typearr.length-1])){
				    		console.log('上传图片')
				    		let filename_arr = newfullfilename.split('.')
				    		console.log('filename_arr-->',filename_arr)
				    		let filenametmp1 = filename_arr[0] + 'new',
				    			filenametmp2 = filename_arr[0] + 'sl'
				    			finalname1 = filenametmp1+'.'+filename_arr[1],
				    			imgsuolvepath = finalname1,
				    			finalname2 = finalname1
				    		console.log('finalname1--->',finalname1)
				    		
				    		jimp.read(userDir+'\\'+newfullfilename).then(function(lenna){
				    			return lenna.resize(jimp.AUTO, 280)
				    						.quality(80)
				    						.write(userDir+'\\'+finalname1)
				    		}).catch(function(err){
				    			console.log('jimp err',err)
				    		})
				    	}
      					let save = new Save({
      						imgsuolvepath:userDir+'\\'+finalname2,
      						imgsrc: result.user.cn + result.user.alias + '/' + newfullfilename,
      						downloadLink:'http://qiandao.szu.edu.cn:81/csseinfo/myfile/'+result.user.cn+result.user.alias+'/'+newfullfilename,
      						//downloadLink:encodeURI(userDir),
      						previewlink:'http://qiandao.szu.edu.cn:81/csseinfo/publicfile/'+result.user.cn+result.user.alias+'/'+newfullfilename,
      						cn : result.user.cn,
      						alias :result.user.alias,
      						filename : newfullfilename,
      						finalname : finalname2,
      						filetype : filetype,
      						filesize : filesize+' Byte',
      						filepath : userDir+'\\'+newfullfilename
      						//filepath : 'qiandao.szu.edu.cn:81/csseinfo/myfile/'+result.user.cn+result.user.alias+'/'+newfullfilename
      					})
      					save.save(function(err,doc){
      						if(err){
      							console.log('save info err--->',err)
      							return res.json({'code':-1})
      						}
      						//console.log('fields---->',fields)
					    	console.log('files---->',files)
					    	console.log('files---->',files.file[0].headers)
					    	return res.json({'code':0,'doc':doc})
      					})
      				});
			    })
	    }
	})
})
router.post('/pubtopri',function(req,res){
	let _id = req.body._id
	console.log('_id--->',_id)
	Save.update({'_id':_id},{'ispublic':0},function(err){
		if(err){
			console.log('pubtopri err',err)
			return res.json({'code':-1,'msg':err})
		}
		console.log('pubtopri success')
		return res.json({'code':0,'msg':'success'})
	})
})
router.post('/pritopub',function(req,res){
	let _id = req.body._id
	console.log('_id--->',_id)
	Save.update({'_id':_id},{'ispublic':1},function(err){
		if(err){
			console.log('pubtopri err',err)
			return res.json({'code':-1,'msg':err})
		}
		console.log('pubtopri success')
		return res.json({'code':0,'msg':'success'})
	})
})
router.post('/delwendang',function(req,res){
	let _id = req.body._id
	console.log('_id--->',_id)
	Save.update({'_id':_id},{'isdelete':1},function(err){
		if(err){
			console.log('delete err',err)
			return res.json({'code':-1,'msg':err})
		}
		console.log('delete success')
		return res.json({'code':0,'msg':'success'})
	})
})
router.post('/addtags',function(req,res){
	let tagstr = req.body.tags,
		_id = req.body._id,
		tagarr = tagstr.split(',')
	console.log('tagarr--->',tagarr)
	Save.update({'_id':_id},{'filetag':tagarr},function(err){
		if(err){
			console.log('addtags err',err)
			return res.json({'code':-1,'msg':err})
		}
		console.log('addtags success')
		return res.json({'code':0,'msg':'success'})
	})
})
router.post('/removedfile',function(req,res){
	let filename = req.body.filename
	console.log('filename--->',filename)
	Save.update({'filename':filename},{'isdelete':1},function(err){
		if(err){
			console.log('removedfile err',err)
			return res.json({'code':-1,'msg':err})
		}
		console.log('removedfile success')
		return res.json({'code':0,'msg':'success'})
	})
})
module.exports = router;
