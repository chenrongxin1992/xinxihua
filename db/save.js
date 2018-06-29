/**
 *  @Author:    chenrongxin
 *  @Create Date:   2018-06-05
 *  @Description:   保存信息
 */
const moment = require('moment')
var mongoose = require('./db'),
    Schema = mongoose.Schema

var saveSchema = new Schema({ 
    previewlink:{type:String},//公共预览链接
    finalname:{type:String},//缩略图文件名
    imgsuolvepath:{type:String},//缩略图路径
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
        default : moment().format('YYYY-MM-DD')
    }
})

module.exports = mongoose.model('save',saveSchema);