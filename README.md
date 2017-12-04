# README
## This is the README for the "turnip" 
-------------------
The extension observes all 'feature' documents
and uses the server to provide validation, definition reference and completion proposals.

The code for the extension is in the 'client' folder. It uses the 'vscode-languageclient' node module to launch the language server.

The language server is located in the 'server' folder. 

Before use
-------------------
make sure in setting.json you have the proper configuration
for example: if you open browsertest folder,
"turnip.steps": ["spec/**/*_steps.rb"] 
makes you can refer all steps in  browsertest/spec/**/*_steps.rb


How to use (| is cursor)
-------------------
1. get completion from step definition. 
Given 
Given |
Given 伝言　|
ctl+space get a completion list searched by 伝言
Given 伝言　作成 |
ctl+space get a completion list searched by 伝言 and 作成
hint: each key word shoud be seperated by space(both hafwidth and fullwidth is OK )

2. go to definition
Given "tester でログインする"
right click and go to definition
then you will see the rb files that has:
step ":user でログインする" do |user|
...
end

alt+cursor hover can give you a link to definition
peek definition also be avaible.

Hope you enjoy it.

see source code https://github.com/siumennel/turnip.git