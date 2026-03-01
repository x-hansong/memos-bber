dayjs.extend(window.dayjs_plugin_relativeTime)
dayjs.locale('zh-cn')

function get_info(callback) {
  chrome.storage.sync.get(
    {
      apiUrl: '',
      apiTokens: '',
      hidetag: '',
      showtag: '',
      quicksavetag: '',
      autoTagEnabled: false,
      autoTagCandidates: '',
      autoTagApiUrl: '',
      autoTagApiKey: '',
      autoTagModel: '',
      autoTagSystemPrompt: '',
      autoTagUserPrompt: '',
      memo_lock: '',
      open_action: '',
      open_content: '',
      userid: '',
      resourceIdList: []
    },
    function (items) {
      var flag = false
      var returnObject = {}
      if (items.apiUrl === '' || items.apiTokens === '') {
        flag = false
      } else {
        flag = true
      }
      returnObject.status = flag
      returnObject.apiUrl = items.apiUrl
      returnObject.apiTokens = items.apiTokens
      returnObject.hidetag = items.hidetag
      returnObject.showtag = items.showtag
      returnObject.quicksavetag = items.quicksavetag
      returnObject.autoTagEnabled = items.autoTagEnabled
      returnObject.autoTagCandidates = items.autoTagCandidates
      returnObject.autoTagApiUrl = items.autoTagApiUrl
      returnObject.autoTagApiKey = items.autoTagApiKey
      returnObject.autoTagModel = items.autoTagModel
      returnObject.autoTagSystemPrompt = items.autoTagSystemPrompt
      returnObject.autoTagUserPrompt = items.autoTagUserPrompt
      returnObject.memo_lock = items.memo_lock
      returnObject.open_content = items.open_content
      returnObject.open_action = items.open_action
      returnObject.userid = items.userid
      returnObject.resourceIdList = items.resourceIdList

      if (callback) callback(returnObject)
    }
  )
}

function getLegacyMemosUrl(info, filter) {
  var parent = 'users/' + info.userid;
  return info.apiUrl + 'api/v1/' + parent + '/memos' + (filter || '');
}

function getUniversalMemosUrl(info, filter) {
  return info.apiUrl + 'api/v1/memos' + (filter || '');
}

function requestMemosList(info, filter, onSuccess, onError) {
  $.ajax({
    url: getLegacyMemosUrl(info, filter),
    type: "GET",
    contentType: "application/json",
    dataType: "json",
    headers : {'Authorization':'Bearer ' + info.apiTokens},
    success: onSuccess,
    error: function (xhr) {
      if (xhr && xhr.status === 404) {
        $.ajax({
          url: getUniversalMemosUrl(info, filter),
          type: "GET",
          contentType: "application/json",
          dataType: "json",
          headers : {'Authorization':'Bearer ' + info.apiTokens},
          success: onSuccess,
          error: onError
        })
        return
      }
      if (onError) {
        onError(xhr)
      }
    }
  })
}

function getMemoItems(data) {
  var items = []
  if (Array.isArray(data)) {
    items = data
  } else if (data && Array.isArray(data.memos)) {
    items = data.memos
  }
  return items.filter(function(item) {
    return item && typeof item === 'object'
  })
}

function normalizeTagValue(tag) {
  var rawTag = (tag || '').trim()
  if (!rawTag) {
    return ''
  }
  return rawTag.charAt(0) === '#' ? rawTag : '#' + rawTag
}

function parseTagValues(tagText) {
  var seen = {}
  return (tagText || '')
    .split(/[\s,，]+/)
    .map(normalizeTagValue)
    .filter(function(tag) {
      if (!tag || seen[tag]) {
        return false
      }
      seen[tag] = true
      return true
    })
}

function getDefaultAutoTagSystemPrompt() {
  return [
    '你是一个严格的标签分类器。',
    '你的任务是：从提供的候选标签中，选择最适合当前内容的一个标签。',
    '规则：',
    '1. 只能从候选标签列表中选择，绝不能创造新标签。',
    '2. 只返回一个标签。',
    '3. 返回内容必须是纯标签文本，不要解释、不要句子、不要标点、不要代码块。',
    '4. 如果候选标签都不合适，就返回：SKIP',
    '5. 如果有明确匹配，优先选择最具体的标签。'
  ].join('\n')
}

function getDefaultAutoTagUserPrompt() {
  return [
    '请根据下面内容选择一个最合适的标签。',
    '',
    '候选标签：',
    '{{candidate_tags}}',
    '',
    '待分类内容：',
    '{{content}}',
    '',
    '补充上下文：',
    '{{extra_context}}'
  ].join('\n')
}

function renderAutoTagPrompt(template, vars) {
  return (template || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, function(_, key) {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key]
    }
    return ''
  })
}

function resolveAutoTagApiUrl(apiUrl) {
  var rawUrl = (apiUrl || '').trim()
  if (!rawUrl) {
    return ''
  }
  if (/\/chat\/completions\/?$/.test(rawUrl)) {
    return rawUrl
  }
  return rawUrl.replace(/\/?$/, '/') + 'chat/completions'
}

function findMatchedCandidateTag(rawText, candidateTags) {
  var text = (rawText || '').trim()
  var directTag = normalizeTagValue(text.replace(/^["'`\s]+|["'`\s]+$/g, ''))
  if (candidateTags.indexOf(directTag) >= 0) {
    return directTag
  }

  var parts = text.split(/[\s,，\n]+/)
  for (var i = 0; i < parts.length; i++) {
    var normalized = normalizeTagValue(parts[i].replace(/^["'`]+|["'`]+$/g, ''))
    if (candidateTags.indexOf(normalized) >= 0) {
      return normalized
    }
  }

  for (var j = 0; j < candidateTags.length; j++) {
    var candidate = candidateTags[j]
    var plainCandidate = candidate.slice(1)
    if (text.indexOf(candidate) >= 0 || text.indexOf(plainCandidate) >= 0) {
      return candidate
    }
  }

  return ''
}

function findExistingCandidateTag(content, candidateTags) {
  var matches = (content || '').match(/(#[^\s#]+)/g) || []
  for (var i = 0; i < matches.length; i++) {
    if (candidateTags.indexOf(matches[i]) >= 0) {
      return matches[i]
    }
  }
  return ''
}

function appendTagsToContent(content, tags) {
  var body = content || ''
  var extraTags = (tags || []).filter(function(tag) {
    return tag && body.indexOf(tag) === -1
  })

  if (extraTags.length === 0) {
    return body
  }

  if (!body) {
    return extraTags.join(' ')
  }

  return body + '\n\n' + extraTags.join(' ')
}

function resolveVisibilityFromContent(content, info) {
  var nowTag = (content || '').match(/(#[^\s#]+)/)
  var sendvisi = info.memo_lock || ''
  if (nowTag) {
    if (nowTag[1] == info.showtag) {
      sendvisi = 'PUBLIC'
    } else if (nowTag[1] == info.hidetag) {
      sendvisi = 'PRIVATE'
    }
  }
  return sendvisi
}

function requestAutoTag(content, info, callback) {
  var done = typeof callback === 'function' ? callback : function () {}
  var candidateTags = parseTagValues(info.autoTagCandidates)
  var endpoint = resolveAutoTagApiUrl(info.autoTagApiUrl)
  var apiKey = (info.autoTagApiKey || '').trim()
  var model = (info.autoTagModel || '').trim()
  var text = (content || '').trim()
  var existingTag = findExistingCandidateTag(text, candidateTags)
  var promptVars = {
    candidate_tags: candidateTags.join(', '),
    content: text,
    extra_context: ''
  }
  var systemPrompt = renderAutoTagPrompt(info.autoTagSystemPrompt || getDefaultAutoTagSystemPrompt(), promptVars)
  var userPrompt = renderAutoTagPrompt(info.autoTagUserPrompt || getDefaultAutoTagUserPrompt(), promptVars)

  if (existingTag) {
    done(existingTag)
    return
  }

  if (!info.autoTagEnabled || !text || candidateTags.length === 0 || !endpoint || !apiKey || !model) {
    done('')
    return
  }

  var timeoutId = null
  var abortController = typeof AbortController === 'function' ? new AbortController() : null
  if (abortController) {
    timeoutId = setTimeout(function() {
      abortController.abort()
    }, 8000)
  }

  fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: model,
      temperature: 0,
      max_tokens: 16,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ]
    }),
    signal: abortController ? abortController.signal : undefined
  }).then(function(response) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    if (!response.ok) {
      throw new Error('Request failed')
    }
    return response.json()
  }).then(function(data) {
    var modelOutput = ''
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      modelOutput = data.choices[0].message.content || ''
    }
    done(findMatchedCandidateTag(modelOutput, candidateTags))
  }).catch(function() {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    done('')
  })
}

function prepareContentForSave(content, info, callback) {
  requestAutoTag(content, info, function(selectedTag) {
    callback(appendTagsToContent(content, selectedTag ? [selectedTag] : []), selectedTag)
  })
}

get_info(function (info) {
  var memoNow = info.memo_lock
  if (memoNow == '') {
    chrome.storage.sync.set(
      { memo_lock: 'PUBLIC' }
    )
    $("#lock-now").text(chrome.i18n.getMessage("lockPublic"))
  }
  if (memoNow == "PUBLIC") {
    $("#lock-now").text(chrome.i18n.getMessage("lockPublic"))
  } else if (memoNow == "PRIVATE") {
    $("#lock-now").text(chrome.i18n.getMessage("lockPrivate"))
  } else if (memoNow == "PROTECTED") {
    $("#lock-now").text(chrome.i18n.getMessage("lockProtected"))
  }
  if (info.open_action === 'upload_image') {
    //打开的时候就是上传图片
    uploadImage(info.open_content)
  } else {
    $("textarea[name=text]").val(info.open_content)
  }
  //从localstorage 里面读取数据
  setTimeout(get_info, 1)
})

$("textarea[name=text]").focus()

//监听输入结束，保存未发送内容到本地
$("textarea[name=text]").blur(function () {
  chrome.storage.sync.set(
    { open_action: 'save_text', open_content: $("textarea[name=text]").val() }
  )
})

$("textarea[name=text]").on('keydown', function (ev) {
  if (ev.code === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
    $('#content_submit_text').click()
  }
})

//监听拖拽事件，实现拖拽到窗口上传图片
initDrag()

//监听复制粘贴事件，实现粘贴上传图片
document.addEventListener('paste', function (e) {
  let photo = null
  if (e.clipboardData.files[0]) {
    photo = e.clipboardData.files[0]
  } else if (e.clipboardData.items[0] && e.clipboardData.items[0].getAsFile()) {
    photo = e.clipboardData.items[0].getAsFile()
  }

  if (photo != null) {
    uploadImage(photo)
  }
})

function initDrag() {
  var file = null
  var obj = $("textarea[name=text]")[0]
  obj.ondragenter = function (ev) {
    if (ev.target.className === 'common-editor-inputer') {
      $.message({
        message: chrome.i18n.getMessage("picDrag"),
        autoClose: false
      })
      $('body').css('opacity', 0.3)
    }
    ev.dataTransfer.dropEffect = 'copy'
  }
  obj.ondragover = function (ev) {
    ev.preventDefault()
    ev.dataTransfer.dropEffect = 'copy'
  }
  obj.ondrop = function (ev) {
    $('body').css('opacity', 1)
    ev.preventDefault()
    var files = ev.dataTransfer.files || ev.target.files
    for (var i = 0; i < files.length; i++) {
      file = files[i]
    }
    uploadImage(file)
  }
  obj.ondragleave = function (ev) {
    ev.preventDefault()
    if (ev.target.className === 'common-editor-inputer') {
      $.message({
        message: chrome.i18n.getMessage("picCancelDrag")
      })
      $('body').css('opacity', 1)
    }
  }
}

let relistNow = []
function uploadImage(file) {
  $.message({
    message: chrome.i18n.getMessage("picUploading"),
    autoClose: false
  });
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64String = e.target.result.split(',')[1];
      uploadImageNow(base64String, file);
    };
    reader.onerror = function(error) {
      console.error('Error reading file:', error);
    };
    reader.readAsDataURL(file);
};

function uploadImageNow(base64String, file) {
  get_info(function(info) {
    if (info.status) {
      let old_name = file.name.split('.');
      let file_ext = file.name.split('.').pop();
      let now = dayjs().format('YYYYMMDDHHmmss');
      let new_name = old_name[0] + '_' + now + '.' + file_ext;
      var hideTag = info.hidetag
      var showTag = info.showtag
      var nowTag = $("textarea[name=text]").val().match(/(#[^\s#]+)/)
      var sendvisi = info.memo_lock || ''
      if(nowTag){
        if(nowTag[1] == showTag){
          sendvisi = 'PUBLIC'
        }else if(nowTag[1] == hideTag){
          sendvisi = 'PRIVATE'
        }
      }
      const data = {
        content: base64String,
        visibility: sendvisi,
        filename: new_name,
        type: file.type
      };
      var upAjaxUrl = info.apiUrl + 'api/v1/resources';
      $.ajax({
        url: upAjaxUrl,
        data: JSON.stringify(data),
        type: 'post',
        cache: false,
        processData: false,
        contentType: 'application/json',
        dataType: 'json',
        headers: { 'Authorization': 'Bearer ' + info.apiTokens },
        success: function (data) {
          // 0.24 版本+ 返回体uid已合并到name字段
          if (data.name) {
            // 更新上传的文件信息并暂存浏览器本地
            relistNow.push({
              "name":data.name,
              "createTime":data.createTime,
              "type":data.type
            })
            chrome.storage.sync.set(
              {
                open_action: '',
                open_content: '',
                resourceIdList: relistNow
              },
              function () {
                $.message({
                  message: chrome.i18n.getMessage("picSuccess")
                })
              }
            )
          } else {
            //发送失败 清空open_action（打开时候进行的操作）,同时清空open_content
            chrome.storage.sync.set(
              {
                open_action: '',
                open_content: '',
                resourceIdList: []
              },
              function () {
                $.message({
                  message: chrome.i18n.getMessage("picFailed")
                })
              }
            )
          }
        }
      });
    }else {
      $.message({
        message: chrome.i18n.getMessage("placeApiUrl")
      })
    }
  });
}

$('#opensite').click(function () {
  get_info(function (info) {
    chrome.tabs.create({url:info.apiUrl})
  })
})

// 0.23.1版本 GET api/v1/{parent}/tags 接口已移除，参考 https://github.com/usememos/memos/issues/4161 
$('#tags').click(function () {
  get_info(function (info) {
    if (info.apiUrl) {
      // 从最近的1000条memo中获取tags,因此不保证获取能全部的
      var tagDom = "";
      requestMemosList(info, '?pageSize=1000', function (data) {
          // 提前并去重所有标签
          const allTags = getMemoItems(data).flatMap(function(memo) {
            return memo.tags || []
          });
          const uniTags = [...new Set(allTags)];
          $.each(uniTags, function (_, tag) {
            tagDom += '<span class="item-container">#' + tag + '</span>';
          });
          $("#taglist").html(tagDom).slideToggle(500)
      })
    } else {
      $.message({
        message: chrome.i18n.getMessage("placeApiUrl")
      })
    }
  })
})

$('#lock').click(function () {
  $("#lock-wrapper").toggleClass( "!hidden", 1000 );
})

$(document).on("click",".item-lock",function () {
  $("#lock-wrapper").toggleClass( "!hidden", 1000 );
  $("#lock-now").text($(this).text())
    _this = $(this)[0].dataset.type;
    chrome.storage.sync.set(
      {memo_lock: _this}
    )
})

$('#search').click(function () {
  get_info(function (info) {
  const pattern = $("textarea[name=text]").val()
  var filter = "?filter=" + encodeURIComponent(`visibility in ["PUBLIC","PROTECTED"] && content.contains("${pattern}")`);
  if (info.status) {
    $("#randomlist").html('').hide()
    var searchDom = ""
    if(pattern){
      requestMemosList(info, filter, function(data){
          let searchData = getMemoItems(data).filter(function(memo) {
            return memo.name
          })
          if(searchData.length == 0){
            $.message({
              message: chrome.i18n.getMessage("searchNone")
            })
          }else{
            for(var i=0;i < searchData.length;i++){
              var memosID = searchData[i].name.split('/').pop();
              searchDom += '<div class="random-item"><div class="random-time"><span id="random-link" data-uid="'+memosID+'"><svg class="icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M864 640a32 32 0 0 1 64 0v224.096A63.936 63.936 0 0 1 864.096 928H159.904A63.936 63.936 0 0 1 96 864.096V159.904C96 124.608 124.64 96 159.904 96H384a32 32 0 0 1 0 64H192.064A31.904 31.904 0 0 0 160 192.064v639.872A31.904 31.904 0 0 0 192.064 864h639.872A31.904 31.904 0 0 0 864 831.936V640zm-485.184 52.48a31.84 31.84 0 0 1-45.12-.128 31.808 31.808 0 0 1-.128-45.12L815.04 166.048l-176.128.736a31.392 31.392 0 0 1-31.584-31.744 32.32 32.32 0 0 1 31.84-32l255.232-1.056a31.36 31.36 0 0 1 31.584 31.584L924.928 388.8a32.32 32.32 0 0 1-32 31.84 31.392 31.392 0 0 1-31.712-31.584l.736-179.392L378.816 692.48z" fill="#666" data-spm-anchor-id="a313x.7781069.0.i12" class="selected"/></svg></span><span id="random-delete" data-name="'+searchData[i].name+'" data-uid="'+memosID+'"><svg class="icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M224 322.6h576c16.6 0 30-13.4 30-30s-13.4-30-30-30H224c-16.6 0-30 13.4-30 30 0 16.5 13.5 30 30 30zm66.1-144.2h443.8c16.6 0 30-13.4 30-30s-13.4-30-30-30H290.1c-16.6 0-30 13.4-30 30s13.4 30 30 30zm339.5 435.5H394.4c-16.6 0-30 13.4-30 30s13.4 30 30 30h235.2c16.6 0 30-13.4 30-30s-13.4-30-30-30z" fill="#666"/><path d="M850.3 403.9H173.7c-33 0-60 27-60 60v360c0 33 27 60 60 60h676.6c33 0 60-27 60-60v-360c0-33-27-60-60-60zm-.1 419.8l-.1.1H173.9l-.1-.1V464l.1-.1h676.2l.1.1v359.7z" fill="#666"/></svg></span>'+dayjs(searchData[i].createTime).fromNow()+'</div><div class="random-content">'+searchData[i].content.replace(/!\[.*?\]\((.*?)\)/g,' <img class="random-image" src="$1"/> ').replace(/\[(.*?)\]\((.*?)\)/g,' <a href="$2" target="_blank">$1</a> ')+'</div>'
              if(searchData[i].resources && searchData[i].resources.length > 0){
                var resources = searchData[i].resources;
                for(var j=0;j < resources.length;j++){
                  var restype = resources[j].type.slice(0,5);
                  var resexlink = resources[j].externalLink
                  var resLink = '',fileId=''
                  if(resexlink){
                    resLink = resexlink
                  }else{
                    fileId = resources[j].publicId || resources[j].filename
                    resLink = info.apiUrl+'file/'+resources[j].name+'/'+fileId
                }
                  if(restype == 'image'){
                    searchDom += '<img class="random-image" src="'+resLink+'"/>'
                  }
                  if(restype !== 'image'){
                    searchDom += '<a target="_blank" rel="noreferrer" href="'+resLink+'">'+resources[j].filename+'</a>'
                  }
                }
              }
              searchDom += '</div>'
            }
            window.ViewImage && ViewImage.init('.random-image')
            $("#randomlist").html(searchDom).slideDown(500);
          }
      });
    }else{
      $.message({
        message: chrome.i18n.getMessage("searchNow")
      })
    }
  } else {
    $.message({
      message: chrome.i18n.getMessage("placeApiUrl")
    })
  }
})
})

$('#random').click(function () {
  get_info(function (info) {
    var filter = "?filter=" + encodeURIComponent(`visibility in ["PUBLIC","PROTECTED"]`);
    if (info.status) {
      $("#randomlist").html('').hide()
      requestMemosList(info, filter, function(data){
          var memos = getMemoItems(data).filter(function(memo) {
            return memo.name
          })
          if(memos.length == 0){
            $.message({
              message: chrome.i18n.getMessage("searchNone")
            })
            return
          }
          let randomNum = Math.floor(Math.random() * (memos.length));
          var randomData = memos[randomNum]
          randDom(randomData)
      })
    } else {
      $.message({
        message: chrome.i18n.getMessage("placeApiUrl")
      })
    }
  })
})

function randDom(randomData){
  if (!randomData || !randomData.name) {
    $.message({
      message: chrome.i18n.getMessage("searchNone")
    })
    return
  }
  get_info(function (info) {
  var memosID = randomData.name.split('/').pop();
  var randomDom = '<div class="random-item"><div class="random-time"><span id="random-link" data-uid="'+memosID+'"><svg class="icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M864 640a32 32 0 0 1 64 0v224.096A63.936 63.936 0 0 1 864.096 928H159.904A63.936 63.936 0 0 1 96 864.096V159.904C96 124.608 124.64 96 159.904 96H384a32 32 0 0 1 0 64H192.064A31.904 31.904 0 0 0 160 192.064v639.872A31.904 31.904 0 0 0 192.064 864h639.872A31.904 31.904 0 0 0 864 831.936V640zm-485.184 52.48a31.84 31.84 0 0 1-45.12-.128 31.808 31.808 0 0 1-.128-45.12L815.04 166.048l-176.128.736a31.392 31.392 0 0 1-31.584-31.744 32.32 32.32 0 0 1 31.84-32l255.232-1.056a31.36 31.36 0 0 1 31.584 31.584L924.928 388.8a32.32 32.32 0 0 1-32 31.84 31.392 31.392 0 0 1-31.712-31.584l.736-179.392L378.816 692.48z" fill="#666" data-spm-anchor-id="a313x.7781069.0.i12" class="selected"/></svg></span><span id="random-delete" data-uid="'+memosID+'" data-name="'+randomData.name+'"><svg class="icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M224 322.6h576c16.6 0 30-13.4 30-30s-13.4-30-30-30H224c-16.6 0-30 13.4-30 30 0 16.5 13.5 30 30 30zm66.1-144.2h443.8c16.6 0 30-13.4 30-30s-13.4-30-30-30H290.1c-16.6 0-30 13.4-30 30s13.4 30 30 30zm339.5 435.5H394.4c-16.6 0-30 13.4-30 30s13.4 30 30 30h235.2c16.6 0 30-13.4 30-30s-13.4-30-30-30z" fill="#666"/><path d="M850.3 403.9H173.7c-33 0-60 27-60 60v360c0 33 27 60 60 60h676.6c33 0 60-27 60-60v-360c0-33-27-60-60-60zm-.1 419.8l-.1.1H173.9l-.1-.1V464l.1-.1h676.2l.1.1v359.7z" fill="#666"/></svg></span>'+dayjs(randomData.createTime).fromNow()+'</div><div class="random-content">'+randomData.content.replace(/!\[.*?\]\((.*?)\)/g,' <img class="random-image" src="$1"/> ').replace(/\[(.*?)\]\((.*?)\)/g,' <a href="$2" target="_blank">$1</a> ')+'</div>'
  if(randomData.resources && randomData.resources.length > 0){
    var resources = randomData.resources;
    for(var j=0;j < resources.length;j++){
      var restype = resources[j].type.slice(0,5);
      var resexlink = resources[j].externalLink
      var resLink = '',fileId=''
      if(resexlink){
        resLink = resexlink
      }else{
        fileId = resources[j].publicId || resources[j].filename
        resLink = info.apiUrl+'file/'+resources[j].name+'/'+fileId
      }
      if(restype == 'image'){
        randomDom += '<img class="random-image" src="'+resLink+'"/>'
      }
      if(restype !== 'image'){
        randomDom += '<a target="_blank" rel="noreferrer" href="'+resLink+'">'+resources[j].filename+'</a>'
      }
    }
  }
  randomDom += '</div>'
  window.ViewImage && ViewImage.init('.random-image')
  $("#randomlist").html(randomDom).slideDown(500);
  })
}

$(document).on("click","#random-link",function () {
  var memoUid = $("#random-link").data('uid');
  get_info(function (info) {
    chrome.tabs.create({url:info.apiUrl+"m/"+memoUid})
  })
})

$(document).on("click","#random-delete",function () {
get_info(function (info) {
  // var memoUid = $("#random-delete").data('uid');
  var memosName = $("#random-delete").data('name');
  var deleteUrl = info.apiUrl+'api/v1/'+memosName
  $.ajax({
    url:deleteUrl,
    type:"PATCH",
    data:JSON.stringify({
      // 'uid': memoUid,
      'state': "ARCHIVED"
    }),
    contentType:"application/json",
    dataType:"json",
    headers : {'Authorization':'Bearer ' + info.apiTokens},
    success: function(result){
          $("#randomlist").html('').hide()
              $.message({
                message: chrome.i18n.getMessage("archiveSuccess")
              })
  },error:function(err){//清空open_action（打开时候进行的操作）,同时清空open_content
              $.message({
                message: chrome.i18n.getMessage("archiveFailed")
              })
          }
  })
})
})

$(document).on("click",".item-container",function () {
  var tagHtml = $(this).text()+" "
  add(tagHtml);
})

$('#newtodo').click(function () {
  var tagHtml = "\n- [ ] "
  add(tagHtml);
})

$('#getlink').click(function () {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    var linkHtml = " ["+tab.title+"]("+tab.url+") "
    if(tab.url){
      add(linkHtml);
    }else{
      $.message({
        message: chrome.i18n.getMessage("getTabFailed")
      })
    }
  })
})

$('#upres').click(async function () {
  $('#inFile').click()
})

$('#inFile').on('change', function(data){
  var fileVal = $('#inFile').val();
  var file = null
  if(fileVal == '') {
    return;
  }
  file= this.files[0];
  uploadImage(file)
});

function add(str) {
  var tc = document.getElementById("content");
  var tclen = tc.value.length;
  tc.focus();
  if(typeof document.selection != "undefined"){
    document.selection.createRange().text = str;
  }else{
    tc.value = 
      tc.value.substr(0, tc.selectionStart) +
      str +
      tc.value.substring(tc.selectionStart, tclen);
  }
}

$('#blog_info_edit').click(function () {
  chrome.runtime.openOptionsPage()
})

$('#content_submit_text').click(function () {
  var contentVal = $("textarea[name=text]").val()
  if(contentVal){
    sendText()
  }else{
    $.message({
      message: chrome.i18n.getMessage("placeContent")
    })
  }
})

function getOne(memosId){
  get_info(function (info) {
  if (info.apiUrl) {
    $("#randomlist").html('').hide()
        var getUrl = info.apiUrl+'api/v1/'+memosId
        $.ajax({
          url:getUrl,
          type:"GET",
          contentType:"application/json",
          dataType:"json",
          headers : {'Authorization':'Bearer ' + info.apiTokens},
          success: function(data){
            randDom(data)
          }
        })
  } else {
    $.message({
      message: chrome.i18n.getMessage("placeApiUrl")
    })
  }
  })
}

function sendText() {
  get_info(function (info) {
    if (info.status) {
      $.message({
        message: chrome.i18n.getMessage("memoUploading")
      })
      //$("#content_submit_text").attr('disabled','disabled');
      let content = $("textarea[name=text]").val()
      prepareContentForSave(content, info, function(finalContent) {
        $.ajax({
          url:info.apiUrl+'api/v1/memos',
          type:"POST",
          data:JSON.stringify({
            'content': finalContent,
            'visibility': resolveVisibilityFromContent(finalContent, info)
          }),
          contentType:"application/json",
          dataType:"json",
          headers : {'Authorization':'Bearer ' + info.apiTokens},
          success: function(data){
            if(info.resourceIdList.length > 0 ){
              //匹配图片
              $.ajax({
                url:info.apiUrl+'api/v1/'+data.name,
                type:"PATCH",
                data:JSON.stringify({
                  'resources': info.resourceIdList || [],
                }),
                contentType:"application/json",
                dataType:"json",
                headers : {'Authorization':'Bearer ' + info.apiTokens},
                success: function(res){
                  getOne(data.name)
                }
              })
            }else{
              getOne(data.name)
            }
            chrome.storage.sync.set(
              { open_action: '', open_content: '',resourceIdList:[]},
              function () {
                $.message({
                  message: chrome.i18n.getMessage("memoSuccess")
                })
                //$("#content_submit_text").removeAttr('disabled');
                $("textarea[name=text]").val('')
              }
            )
        },error:function(err){//清空open_action（打开时候进行的操作）,同时清空open_content
                chrome.storage.sync.set(
                  { open_action: '', open_content: '',resourceIdList:[] },
                  function () {
                    $.message({
                      message: chrome.i18n.getMessage("memoFailed")
                    })
                  }
                )},
        })
      })
    } else {
      $.message({
        message: chrome.i18n.getMessage("placeApiUrl")
      })
    }
  })
}  
