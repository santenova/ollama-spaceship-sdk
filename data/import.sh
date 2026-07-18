
for i in Persona.json Template.json; do
idx=$(echo "sample-prompt-$i" | tr [A-Z] [a-z] | tr -d "_" | sed "s/.json//"); 
echo ./venv/bin/python3  ./import.py --url http://127.0.0.1:9200 --file ./$i --index $idx;
done
