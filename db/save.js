/**
 *  @Author:    chenrongxin
 *  @Create Date:   2018-06-05
 *  @Description:   保存信息
 */
const moment = require('moment')
var mongoose = require('./db'),
    Schema = mongoose.Schema

var saveSchema = new Schema({ 
    isdelete:{type:Number,default:0},//删除标识
    imgsrc : {type:String},
    downloadLink:{type:String},
    cn : {type:String},
    alias : {type:String},   
    ispublic : {type:Number,default:1},      
    filename : { type: String },
    filetype : {type : String},     
    filesize : { type : String},
    filepath : {type :String},
    filecontent : {type:String},
    filedescription : {type : String},//描述
    filetag : {type : Array},//标签
    created_time:{
        type : String,
        default : moment().format('YYYY-MM-DD hh:mm:ss')
    }
})

module.exports = mongoose.model('save',saveSchema);