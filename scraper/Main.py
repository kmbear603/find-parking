import urllib.request
import urllib.parse
import pyquery
import requests
import json
import os
import time
import datetime
import dateutil.parser
import random

DEBUG = False

def http_post_json(url, json):
    hdrs = {
        "User-Agent": "curl/7.64.0", #"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36",
        "Connection": "keep-alive",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        'Accept-Language': 'en-US,en;q=0.5',
        "upgrade-insecure-requests": "1"
    }

    with requests.Session() as session:
        trial = 0
        while True:
            trial += 1
            try:
                res = session.post(url=url, headers=hdrs, json=json)
                if res.status_code != 200:
                    raise ValueError("response=" + str(res.status_code))
            except urllib.request.HTTPError as e:
                if trial == 5:
                    raise e
                else:
                    continue

            return True

def http_get_text(url):
    hdrs = {
        "User-Agent": "curl/7.64.0", #"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36",
        "Connection": "keep-alive",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        'Accept-Language': 'en-US,en;q=0.5',
        "upgrade-insecure-requests": "1",
    }

    with requests.Session() as session:
        trial = 0
        while True:
            trial += 1
            try:
                res = session.get(url=url, headers=hdrs)
                return res.text
            except urllib.request.HTTPError as e:
                if (trial == 5):
                    raise e
                else:
                    continue

def http_get_dom(url):
    html = http_get_text(url)
    with open("dump.html", "w", encoding="utf-8") as f:
        f.write(html)
    dom = pyquery.PyQuery(html)
    return dom

def http_get_json(url):
    text = http_get_text(url)
    return json.loads(text)

def http_delete(url):
    hdrs = {
        "User-Agent": "curl/7.64.0", #"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36",
        "Connection": "keep-alive",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        'Accept-Language': 'en-US,en;q=0.5',
        "upgrade-insecure-requests": "1",
    }

    with requests.Session() as session:
        trial = 0
        while True:
            trial += 1
            try:
                res = session.delete(url=url, headers=hdrs)
                return res.text
            except urllib.request.HTTPError as e:
                if (trial == 5):
                    raise e
                else:
                    continue

def get_config(config_file_name):
    if not os.path.isfile(config_file_name):
        raise FileNotFoundError(config_file_name + " is not found")

    try:
        data = json.load(open(config_file_name))
    except:
        raise ValueError(config_file_name + " is not a valid json")

    return data

def get_download_cache_time_endpoint_url(config_file_name):
    data = get_config(config_file_name)
    return data["downloadCacheTimeEndpoint"]

def get_upload_endpoint_url(config_file_name):
    data = get_config(config_file_name)
    return data["uploadEndpoint"]

def get_delete_endpoint_url(config_file_name):
    data = get_config(config_file_name)
    return data["deleteEndpoint"]

def get_all_cache_times_from_FindParking(endpoint_url):
    return http_get_json(endpoint_url)

def get_areas():
    dom = http_get_dom("https://www.parkhaus.hk/")
    figures = dom("figure.highlights-featured-image")

    ret = []

    for figure in figures:
        anchor = dom("a", figure)
        if anchor is None:
            continue

        url = anchor.attr("href")
        name = anchor.attr("title")
        ret.append({
            "name": name,
            "url": url
        })

    return ret

def get_districts(area):
    districts = []

    dom = http_get_dom(area["url"])

    title = dom(".entry-content h3").text()
    if title == "請選擇停車場：":
        # no district
        districts.append({
            "area": area["name"],
            "name": area["name"],
            "url": area["url"]
        })
    else:
        divs = dom("div[data-pid]")

        for div in divs:
            anchor = dom("a", div)

            districts.append({
                "area": area["name"],
                "name": anchor.text(),
                "url": anchor.attr("href")
            })
    
    return districts

def get_carparks(district):
    ret = []

    page = 1
    total_page = 0

    while page == 1 or page <= total_page:
        if page > 1:
            url = district["url"] + "?_page=" + str(page)
        else:
            url = district["url"]
        dom = http_get_dom(url)

        if page == 1:
            # get total number of pages
            pagination_uls = dom("ul.pt-cv-pagination")
            for pagination_ul in pagination_uls:
                total_pages_str = dom(pagination_ul).attr("data-totalpages")
                if total_pages_str:
                    total_page = int(total_pages_str)
                    break

        divs = dom("div[data-pid]")

        for div in divs:
            anchor = dom("a", div)
            ret.append({
                "area": district["area"],
                "district": district["name"],
                "name": anchor.text(),
                "url": anchor.attr("href")
            })
        
        page += 1

    return ret

def throttle():
    seconds = random.randint(0, 5)
    time.sleep(seconds)

def get_carpark_detail(carpark):
    dom = http_get_dom(carpark["url"])
    dom("script").remove()
    dom("link").remove()
    dom("style").remove()

    if DEBUG:
        f = open("dump.html", "w", encoding="utf-8")
        f.write(dom.html())
        f.close()

    last_upd = dom("div.post-meta").text().strip()
    sep = last_upd.find(":")
    if sep >= 0:
        last_upd = last_upd[sep + 1: ].strip()

    name = dom("h1.entry-title").text().strip()
    if name.find("(已關閉)") >= 0:
        return None

    lat_span = dom("span.latitude")
    if len(lat_span) > 1:
        # there is bug in parkhaus that duplicated sections may be shown
        lat = float(dom("span.latitude")[0].text.strip())
        lng = float(dom("span.longitude")[0].text.strip())
    elif len(lat_span) > 0:
        lat = float(dom("span.latitude").text().strip())
        lng = float(dom("span.longitude").text().strip())
    else:
        f = open(name + ".html", "w", encoding="utf-8")
        f.write(dom.html())
        f.close()
        return None

    contents = []

    if len(contents) == 0:
        tab_title_objs = dom("h2.tabtitle")
        if len(tab_title_objs) > 0:
            tab_content_objs = dom("div.tabcontent")

            tab_titles = []
            for tab_title_obj in tab_title_objs:
                tab_titles.append(dom(tab_title_obj).text().strip())

            tab_contents = []
            for tab_content_obj in tab_content_objs:
                div = dom(tab_content_obj)
                tab_contents.append(div.html().strip())

            for i in range(len(tab_titles)):
                title = tab_titles[i]
                if len(title) == 0:
                    title = "DATA" + str(i)
                content = tab_contents[i]

                contents.append({
                    "title": title,
                    "html": content
                })
    
    if len(contents) == 0:
        tab_title_objs = dom("div.fl-tabs-label")
        if len(tab_title_objs) > 0:
            tab_content_objs = dom("div.fl-tabs-panel-content")

            tab_titles = []
            for tab_title_obj in tab_title_objs:
                span = dom("span", tab_title_obj)
                tab_titles.append(span.text().strip())

            tab_contents = []
            for tab_content_obj in tab_content_objs:
                div = dom(tab_content_obj)
                tab_contents.append(div.html().strip())

            for i in range(len(tab_titles)):
                title = tab_titles[i]
                if len(title) == 0:
                    title = "DATA" + str(i)
                content = tab_contents[i]

                contents.append({
                    "title": title,
                    "html": content
                })
    
    if len(contents) == 0:
        content_obj = dom("div.entry-content")
        if len(content_obj) > 0:
            tables = dom("table", content_obj)

            idx = 0
            for table in tables:
                contents.append({
                    "title": "TABLE" + str(idx),
                    "html": dom(table).html().strip()
                })
                idx += 1

    if len(contents) == 0:
        contents.append({
            "title": "網頁格式不明",
            "html": "請到 parkhaus.hk 查看內容",
        })

    modified_meta = dom("meta[property='article:modified_time']")
    if modified_meta:
        modified = modified_meta.attr("content")
    else:
        modified = "N/A"

    return {
        "area": carpark["area"],
        "district": carpark["district"],
        "url": carpark["url"],
        "name": name,
        "lastUpdate": last_upd,
        "location": {
            "latitude": lat,
            "longitude": lng
        },
        "contents": contents,
        "modified": modified
    }

def upload_to_FindParking(url, detail):
    http_post_json(url, detail)

def delete_cache(url, name):
    if url[-1] == '/':
        url = url[:-2]
    http_delete(url + "/" + name)

def sort_by_download_order(lst, cache_times, key):
    obj_name_to_oldest_cache = {}
    for obj in lst:
        name = obj["name"]
        obj_name_to_oldest_cache[name] = 0
    
    for cache_time in cache_times:
        name = cache_time[key]
        time = cache_time["cacheTime"]
        if name in obj_name_to_oldest_cache:
            original_time = obj_name_to_oldest_cache[name]
            if original_time == 0 or time < original_time:
                obj_name_to_oldest_cache[name] = time

    sorted = []
    for obj in lst:
        name = obj["name"]
        time = obj_name_to_oldest_cache[name]

        ins = 0
        for i in range(len(sorted)):
            sorted_obj = sorted[i]
            sorted_name = sorted_obj["name"]
            time_of_sorted = obj_name_to_oldest_cache[sorted_name]
            if time < time_of_sorted:
                break
            ins = i
        sorted.insert(ins, obj)
    
    return sorted

def sort_areas_by_download_order(areas, cache_times):
    return sort_by_download_order(areas, cache_times, "area")

def sort_districts_by_download_order(districts, cache_times):
    return sort_by_download_order(districts, cache_times, "district")

def sort_carparks_by_download_order(carparks, cache_times):
    return sort_by_download_order(carparks, cache_times, "name")

def log_error(msg, e):
    with open("error.log", "a", encoding="utf-8") as f:
        f.write(datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        f.write(" ")
        f.write(msg)
        f.write(" ")
        f.write(e)
        f.write("\n")
        f.close()

def print_file(msg):
    with open("debug.txt", "a+", encoding="utf-8") as f:
        f.write(datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        f.write(" ")
        f.write(msg)
        f.write("\n")
        f.close()

def run():
    details = []
    finishedCarparkNames = {}

    print_file("starting")
    cache_time_endpoint_url = get_download_cache_time_endpoint_url("config.json")
    endpoint_url = get_upload_endpoint_url("config.json")
    delete_endpoint_url = get_delete_endpoint_url("config.json")

    print_file("getting cache status")
    try:
        cache_times = get_all_cache_times_from_FindParking(cache_time_endpoint_url)
    except Exception as e:
        print_file(e)
        log_error("get_all_cache_times_from_FindParking", e)
        return

    print_file("getting areas from parkhaus")
    try:
        areas = get_areas()
    except Exception as e:
        print_file(e)
        log_error("get_areas", e)
        return

    if len(areas) == 0:
        print_file("no area can be found from parkhaus")
        return
    print_file("found " + str(len(areas)) + " areas from parkhaus")

    districts = []

    for area in areas:
        print_file("getting districts in " + area["name"])
        try:
            this_districts = get_districts(area)
        except Exception as e:
            print_file(e)
            log_error("get_districts(" + area["name"] + ")", e)
            continue
        print_file("found " + str(len(this_districts)) + " districts in " + area["name"])

        for district in this_districts:
            districts.append(district)

        if DEBUG:
            break

    print_file("found " + str(len(districts)) + " districts in total")

    carparks = []

    for district in districts:
        print_file("getting car parks in " + district["name"])
        try:
            this_carparks = get_carparks(district)
        except Exception as e:
            print_file(e)
            log_error("get_carparks(" + district["name"] + ")", e)
            continue
        print_file("found " + str(len(this_carparks)) + " car parks in " + district["name"])

        for carpark in this_carparks:
            carparks.append(carpark)

        if DEBUG:
            break

    print_file("found " + str(len(carparks)) + " car parks in total")

    print_file("preparing to pull detail from parkhaus")
    carparks = sort_carparks_by_download_order(carparks, cache_times)

    cache_name_to_modified_map = {}
    for i in range(len(cache_times)):
        cache = cache_times[i]
        name = cache["name"]
        cache_name_to_modified_map[name] = cache["modified"]

    for carpark in carparks:
        print_file("getting detail of " + carpark["name"])
        try:
            detail = get_carpark_detail(carpark)
        except Exception as e:
            print_file(e)
            log_error("get_carpark_detail(" + carpark["name"] + ")", e)
            continue
        if detail is None:
            continue
        
        if carpark["name"] in cache_name_to_modified_map:
            cache_modified = cache_name_to_modified_map[carpark["name"]]
        else:
            cache_modified = None
        if cache_modified is None or cache_modified == "N/A" or cache_modified != detail["modified"]:
            print_file("uploading " + detail["name"])
            try:
                detail["name"] = detail["name"].replace("/", "-");    # replace / with - to avoid upload error
                upload_to_FindParking(endpoint_url, detail)
            except Exception as e:
                print_file(e)
                log_error("upload_to_FindParking(" + detail["name"] + ")", e)
                continue
        else:
            print_file("no change")

        details.append(detail)
        finishedCarparkNames[detail["name"]] = True

        print_file("done " + detail["name"] + ", completed " + str(len(details)) + " of " + str(len(carparks)))

        if DEBUG:
            break

        throttle()

    for cache in cache_times:
        if cache["name"] not in finishedCarparkNames:
            print_file("deleting " + cache["name"])
            try:
                delete_cache(delete_endpoint_url, cache["name"])
            except Exception as e:
                print_file(e)
                log_error("delete_cache(" + cache["name"] + ")", e)
                continue

    f = open("dump-all.json", "w", encoding="utf-8")
    json.dump(details, f, ensure_ascii=False)
    f.close()

def main():
    try:
        run()
    except Exception as e:
        print_file(e)
        log_error("run", e)

if __name__ == "__main__":
    main()
