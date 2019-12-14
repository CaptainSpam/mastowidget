/**
* GNU Social Widget, copyright (C)2019 Nicholas Killewald
* https://github.com/CaptainSpam/gswidget
*
* This file is distributed under the terms of the MIT License,
* a copy of which can be found in the repository listed above.
*/

// We need an RSS feed URL to make this work at all.  Add that in here.
var rssUrl = "";
// This is the ID of the element in which we're putting this.  This is the
// iframe version, so chances are what you want is "body".
var baseDiv = "body";
// All links in the widget, be they links to the posts, user, conversations, or
// links contained in the posts themselves, will be targeted to this.  In
// general, you either want "_parent" to have it take over the page itself or
// "_blank" to spawn a new browser tab.  If you have something more complex set
// up, use that target instead.  Just try not to leave it an empty string, and
// definitely don't make it "_self", as either will  make it try to go to the
// iframe itself, which usually won't work.  Note that all links will open under
// rel="noopener", as that's most likely the best idea for most cases.
var baseTarget = "_blank";

var authorData = {};
var postData = [];
var posts;

var loadingText = "Loading...";
var longLoadingTimeout;
var longLoadingText = "Loading (in theory)...";
var longLoadingElem;
var longLoadingDelay = 5000;

function longLoadingMessage()
{
    longLoadingElem.text(longLoadingText);
}

function constructHtml(base)
{
    // This just builds up the HTML such that we only need one div on the page
    // to begin with.
    base.empty();

    // Make sure the base is a gsw_container!
    base.addClass("gsw_container");

    var curElem = $(document.createElement("div"));
    curElem.addClass("gsw_loading");
    // Loading also has the loading text baked-in.
    curElem.text(loadingText);
    base.append(curElem);

    // Also, let's add in a timeout to add the "(in theory)" text back in if
    // things are taking too long.
    longLoadingElem = curElem;
    longLoadingTimeout = setTimeout(longLoadingMessage, longLoadingDelay);

    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_error");
    base.append(curElem);

    // The main block has a bit more going on.
    var mainBlock = $(document.createElement("div"));
    mainBlock.addClass("gsw_mainblock");

    var userBlock = $(document.createElement("div"));
    userBlock.addClass("gsw_userblock");

    // We build a-tags for the text links, sure, but here we need to wrap the
    // div with an a-tag ahead of time.
    var aElem = $(document.createElement("a"));
    aElem.attr("target", baseTarget);
    aElem.attr("rel", "noopener");
    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_avatar");
    aElem.append(curElem);
    userBlock.append(aElem);

    var userInfo = $(document.createElement("div"));
    userInfo.addClass("gsw_userinfo");

    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_userdisplayname");
    userInfo.append(curElem);

    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_useratname");
    userInfo.append(curElem);

    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_summary");
    userInfo.append(curElem);
    userBlock.append(userInfo);
    mainBlock.append(userBlock);

    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_contentblock");
    mainBlock.append(curElem);
    base.append(mainBlock);
}

function fetchRssData()
{
    // With the RSS URL in hand, off we go for actual data!
    $.get(rssUrl, "", function(data, textStatus, jqXHR)
    {
        var xml = $(data);

        // Get as much author data as we can.
        authorData = extractAuthorData(xml);

        // Posts!
        postData = extractPosts(xml);

        // Since this is RSS, there shouldn't be a next field, unlike previous
        // versions with the OStatus Atom file.  We should only need a single
        // pass.
        finalizePosts();
    }).fail(genericFetchError);
}

function extractAuthorData(xml)
{
    // The RSS data is much easier to parse than the full-on Atom data was.
    // Unfortunately, it doesn't give us as much data, so we might need to
    // improvise.
    var author = xml.children("rss").children("channel");
    var authorData = {};

    // TODO: This is currently optimized for Mastodon's output.  If that output
    // changes or this is some other form of ActivityPub server that doesn't
    // format things the same way, it'll go to fallbacks.  Try to make said
    // fallbacks more robust.
    var title = author.children("title").text().trim();

    // If this is Mastodon, let's assume the title is in the format of
    // "USERTITLE (@USERNAME@INSTANCE)".  If it's not in that format, we're not
    // in Mastodon.
    var authorMatch = title.match(/^(?<displayname>.*)\s\((?<username>@.*@.*)\)$/);
    if(authorMatch) {
        // Got it!
        authorData["displayName"] = authorMatch.groups.displayname;
        authorData["preferredUsername"] = authorMatch.groups.username;
    } else {
        // Okay, crap.  The display name, then, will just be the entire line.
        // We'll ignore the username and just link to this.
        authorData["displayName"] = title;
    }

    // We have at most one avatar image in RSS.  That simplifies things.
    var image = author.children("image");
    if(image) {
        // TODO: This data structure is based on what GNU Social uses, which
        // isn't as useful here.  Change this later to just be a single URL.
        // These width and height values are just dummies.
        authorData["avatar"] = [
            {
                href:image.children("url").first().text().trim(),
                width:"100",
                height:"100",
            }
        ];

        // TODO: If there's no image supplied, this needs a default.
    }

    // The URL is pretty direct.
    authorData["uri"] = author.children("link").text().trim();
    authorData["uriAlt"] = authorData["uri"];

    // Mastodon, for some reason, puts the toot/following/follower count in the
    // RSS description along with the summary.  We can trim out that first part
    // if it exists.  Split based on the separator dot.
    var summary = author.children("description").text().trim();
    console.log(`Summary looks like ${summary}`);
    var summaryMatch = summary.match(/^(?<trimmedjunk>.*)\s\u00b7\s(?<actualsummary>.*)$/);
    console.log("Resulting match:", summaryMatch);
    if(summaryMatch) {
        authorData["summary"] = summaryMatch.groups.actualsummary;
    } else {
        // If it's not Mastodon-like, fall back to the full description.
        authorData["summary"] = summary;
    }
    // TODO: See if Mastodon allows HTML in summaries (and if it carries into
    // the RSS description field).
    authorData["summaryIsHtml"] = false;

    // TODO: I like the idea of the webfeeds:accentColor field, but there
    // doesn't seem to be any way for the user to change this on a per-account
    // basis (or for the server admin to do so without modifying source code),
    // so we'll ignore it for now.

    return authorData;
}

function extractPosts(xml)
{
    // Looks like RSS only returns posts, not follows and boosts like in GNU
    // Social's Atom feed.  That's good, though this doesn't return direct
    // public replies, either, which is not quite as good.  Still, it's what
    // we've got, so let's go with it.
    var posts = xml.children("rss").children("channel").children("item");
    var extractedPostData = [];
    posts.each(function(index) {
        extractedPostData.push(extractPostData(this));
    });

    return extractedPostData;
}

function extractPostData(obj)
{
    // This extracts a post object out of a single entry's XML data.  You call
    // extractPosts first, then call extractPostData from there.
    var data = $(obj);

    // What we have here is a single entry.  What we're returning is a single
    // object to push into an array.  Let's wheel and deal!
    var toReturn = {};

    // There's a title involved, but in Mastodon, it's always "New status by
    // <USERNAME>".  Not very useful, but still...
    toReturn["title"] = data.find("title").text().trim();

    // The content!  This is the important part.
    toReturn["content"] = data.find("description").text().trim();

    // This comes in plaintext format, which I think can be converted.
    toReturn["published"] = data.find("pubDate").text().trim();

    // Maybe we should provide a link to the post itself.
    toReturn["url"] = data.find("link").text().trim();

    // Unfortunately, the RSS feed doesn't include replies, so we can skip over
    // that part of the previous logic and skip straight to a unique ID.
    toReturn["id"] = data.find("guid").text();

    // That should be all the data we need.  Away!
    return toReturn;
}

function getAvatarData(maxWidth)
{
    // This will pick the best avatar data for the given avatar width, assuming
    // all avatars are square and we want either the exact width or one size
    // *bigger* (as it's usually better to scale down than scale up).  We don't
    // yet have a way to guarantee sorting, so we're just searching the entire
    // array for now.

    // First, if there is no avatar data, return an empty object.
    if(authorData["avatar"].length <= 0)
    {
        return {};
    }

    var best;
    var bestDifference;
    for(var i = 0, l = authorData["avatar"].length; i < l; i++)
    {
        var data = authorData["avatar"][i];
        var width = parseInt(data["width"]);

        // If this is an exact match, we're done!  Short-circuit our way out.
        if(width === maxWidth)
        {
            return data;
        }

        // Otherwise, if this is the first one we came across, keep it.
        if(typeof best === "undefined")
        {
            best = data;
            bestDifference = width - maxWidth;
            continue;
        }

        // If this is greater than the target and closer than the current best
        // (assuming positive differences always win over negatives), this is
        // our new best.
        if((width > maxWidth && (bestDifference < 0 || bestDifference > width - maxWidth))
                || (width < maxWidth && (bestDifference < 0 && bestDifference < width - maxWidth)))
        {
            // WIN!
            best = data;
            bestDifference = width - maxWidth;
        }
    }

    // Whatever was the best, out it goes!
    return best;
}

function showError(errorText)
{
    var base = $(baseDiv);
    setMode(base, "error");
    var error = base.find(".gsw_error");
    error.text(errorText);
}

function genericFetchError(data)
{
    // Chances are the browser already dumped an error to console.log in this
    // case, so we don't need to do that here.
    showError("There was some sort of problem reading your Atom feed.  If you're sure you typed it in right, maybe that server doesn't allow cross-domain Javascript widgets access to the feed (Mastodon instances in particular might deny access by default)?");
}

function setMode(base, modeString)
{
    // Our modes of choice today are:
    //
    // "loading"
    // "display"
    // "error"
    if(modeString === "loading")
    {
        base.find(".gsw_loading").toggle(true);
        base.find(".gsw_mainblock").toggle(false);
        base.find(".gsw_error").toggle(false);
    }
    else if(modeString === "display")
    {
        base.find(".gsw_loading").toggle(false);
        base.find(".gsw_mainblock").toggle(true);
        base.find(".gsw_error").toggle(false);
    }
    else if(modeString === "error")
    {
        base.find(".gsw_loading").toggle(false);
        base.find(".gsw_mainblock").toggle(false);
        base.find(".gsw_error").toggle(true);
    }
}

function showAuthorData(base)
{
    var avatar = getAvatarData(96);

    base.find(".gsw_avatar").parent().attr("href", authorData["uriAlt"]);
    base.find(".gsw_avatar").css("background-image", "url(\"" + avatar["href"] + "\")");

    var aElem = $(document.createElement("a"));
    aElem.text(authorData["displayName"]);
    aElem.attr("href", authorData["uriAlt"]);
    aElem.attr("target", baseTarget);
    aElem.attr("rel", "noopener");
    base.find(".gsw_userdisplayname").append(aElem);

    var userAtName = base.find(".gsw_useratname");
    aElem = $(document.createElement("a"));
    aElem.text(authorData["uriAlt"]);
    aElem.attr("href", authorData["uriAlt"]);
    aElem.attr("target", baseTarget);
    aElem.attr("rel", "noopener");
    userAtName.append(aElem);
    if(authorData["summaryIsHtml"]) {
        base.find(".gsw_summary").html(authorData["summary"]);
    } else {
        base.find(".gsw_summary").text(authorData["summary"]);
    }
}

function showAllPosts(base)
{
    var entries = base.find(".gsw_contentblock");

    // Later, we'll want to be able to update the content (i.e. adding more
    // entries after a timeout if more have been added at the source), but for
    // now, let's always assume a complete wipe.
    entries.empty();

    $.each(postData, function(index, data)
            {
                var entryElem = $(document.createElement("div"));
                entryElem.addClass("gsw_entry");
                entryElem.attr("id", data["id"]);

                var curElem;

                // The current layout is pretty simple.  Should just be a series
                // of blocks stacked on top of each other.

                // First, the date.  I'll do more conversion later, but for now,
                // the string we got for the date should be convertable to the
                // local timezone this way.  There's more stable ways to do
                // this, I know.
                var date = new Date(data["published"]);
                curElem = $(document.createElement("div"));
                curElem.addClass("gsw_entry_date");

                var aElem = $(document.createElement("a"));
                aElem.attr("href", data["url"]);
                aElem.attr("target", baseTarget);
                aElem.attr("rel", "noopener");
                aElem.text(date);
                curElem.append(aElem);
                entryElem.append(curElem);

                // We don't really get all the data we need to make a full,
                // clean "in reply to <USER>..." string here.  Until we can get
                // that, we'll settle for "(part of a conversation)" and link to
                // it on the local server.  Remember, "conversation" should
                // always exist.  in-reply-to is the one that tells us this is a
                // reply to something.
                //
                // TODO: Once we can generate "in reply to <USER>...", rewrite
                // this to link back to THAT post, not the local conversation.
                if("in-reply-to" in data)
                {
                    curElem = $(document.createElement("div"));
                    curElem.addClass("gsw_in_reply_to");

                    aElem = $(document.createElement("a"));
                    aElem.attr("href", data["conversation"]);
                    aElem.attr("target", baseTarget);
                    aElem.attr("rel", "noopener");
                    aElem.text("(part of a conversation)");
                    curElem.append(aElem);
                    entryElem.append(curElem);
                }

                // Get the content and paste that in, too.  This may need more
                // careful analysis later; as it stands, content comes in as
                // sanitized text, due to this being XML and not CDATA-wrapped.
                // However, the HTML within said text is required for things
                // like links or images to work.  I may need more work here to
                // make sure we don't have someone being a jerk and putting,
                // say, <script> tags in.
                curElem = $(document.createElement("div"));
                curElem.addClass("gsw_entry_content");
                curElem.html(data["content"]);

                // Now, if there were any <a> tags in the content, they have to
                // be re-targeted so that it'll actually break out of the
                // iframe.  It'd be very embarrassing otherwise.
                curElem.find("a").attr("target", baseTarget);
                curElem.find("a").attr("rel", "noopener");

                entryElem.append(curElem);

                // Finally, toss the block on to the end!
                entries.append(entryElem);

                // And add a separator.
                entries.append($(document.createElement("hr")));
            });

    // And knock out that last separator.
    entries.find("hr").last().remove();
}

function finalizePosts()
{
    console.log("Found " + postData.length + " posts.");

    // Stop the long-loading timeout, if it's still waiting.
    clearTimeout(longLoadingTimeout);

    var base = $(baseDiv);

    setMode(base, "display");
    showAuthorData(base);
    showAllPosts(base);
}

$(document).ready(function()
{
    var widget = $(baseDiv);

    constructHtml(widget);
    setMode(widget, "loading");

    widget.css("visibility", "visible");

    // So, where do we start?
    if(rssUrl.length <= 0)
    {
        showError("The rssUrl variable isn't defined; you'll need to look that up to use this widget.");
        console.error("rssUrl isn't defined; you'll need to look that up to use this.  It's right near the top of the gnu_social_widget.js file.");
        return;
    }
    else
    {
        // RSS data!  Quick!  To AJAX!
        fetchRssData();
    }
});

