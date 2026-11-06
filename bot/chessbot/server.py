import uvicorn

def main():
    uvicorn.run(app, host="0.0.0.0", port=8000)



if __name__ == "main":
    print('hello world')
    main()